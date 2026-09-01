import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import App from "../src/App.tsx";
import type { PresenceSnapshot } from "../src/api.ts";

/** 서버 렌더로 마크업을 뽑는다. 미리 넣은 데이터를 useQuery 가 그대로 읽는다. */
function render(snapshot: PresenceSnapshot | undefined): string {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	if (snapshot) {
		client.setQueryData(["presence"], snapshot);
	}

	return renderToString(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(App),
		),
	);
}

const now = Date.now();

const snapshot: PresenceSnapshot = {
	meetingId: "10000000001",
	meetingUuid: "TESTUUID0004==",
	count: 3,
	totalCount: 4,
	startedAt: "2026-08-30T07:23:10Z",
	startedAtEstimated: false,
	openedBy: "현승곤",
	updatedAt: new Date(now - 3000).toISOString(),
	participants: [
		{
			participantUuid: "p1",
			connectionCount: 1,
			// 서버가 진행 중인 구간까지 더해서 준다
			onlineSeconds: 71 * 60,
			displayName: "조하나",
			firstJoinedAt: new Date(now - 72 * 60_000).toISOString(),
			isPresent: true,
			lastOccurredAt: new Date(now - 60_000).toISOString(),
			statusMessage: "집중 중",
			isYou: true,
			joinTimeUncertain: false,
		},
		{
			participantUuid: "p2",
			connectionCount: 1,
			onlineSeconds: 0,
			displayName: "참가자02",
			firstJoinedAt: new Date(now - 4 * 60_000).toISOString(),
			isPresent: true,
			lastOccurredAt: new Date(now - 30_000).toISOString(),
			statusMessage: null,
			isYou: false,
			joinTimeUncertain: false,
		},
		{
			participantUuid: "p3",
			connectionCount: 1,
			onlineSeconds: 0,
			displayName: null,
			firstJoinedAt: new Date(now).toISOString(),
			isPresent: true,
			lastOccurredAt: new Date(now).toISOString(),
			statusMessage: null,
			isYou: false,
			joinTimeUncertain: false,
		},
		{
			participantUuid: "p4",
			connectionCount: 1,
			onlineSeconds: 28 * 60,
			displayName: "김동현",
			firstJoinedAt: new Date(now - 40 * 60_000).toISOString(),
			isPresent: false,
			lastOccurredAt: new Date(now - 12 * 60_000).toISOString(),
			statusMessage: null,
			isYou: false,
			joinTimeUncertain: false,
		},
	],
};

describe("App", () => {
	const html = render(snapshot);

	it("접속 인원수를 보여준다", () => {
		expect(html).toContain("접속 중");
		expect(html).toContain("3");
		expect(html).toContain("명");
	});

	it("온라인과 오프라인 구역을 나눠 보여준다", () => {
		expect(html).toContain("온라인");
		expect(html).toContain("오프라인");
		expect(html).toContain("section--online");
		expect(html).toContain("section--offline");
	});

	it("온라인 구역이 오프라인 구역보다 위에 온다", () => {
		expect(html.indexOf("section--online")).toBeLessThan(
			html.indexOf("section--offline"),
		);
	});

	it("나간 사람을 오프라인 구역에 보여준다", () => {
		expect(html).toContain("김동현");
		expect(html).toContain("12분 전 퇴장");
	});

	it("나간 사람에게 offline 스타일을 준다", () => {
		expect(html).toContain("card--offline");
	});

	it("본인으로 추정되면 '(나)' 를 붙인다", () => {
		expect(html).toContain("card__me");
		expect(html).toContain("(나)");
	});

	it("본인이 아닌 사람에게는 표시가 없다", () => {
		const none = render({
			...snapshot,
			participants: snapshot.participants.map((p) => ({ ...p, isYou: false })),
		});
		expect(none).not.toContain("card__me");
	});

	it("입장 시각을 모르면 시간 뒤에 + 를 붙인다", () => {
		// 머문 시간은 잴 수 있지만 놓친 앞부분이 있으므로 아래로만 틀린다.
		const unknown = render({
			...snapshot,
			participants: snapshot.participants.map((p) =>
				p.participantUuid === "p1" ? { ...p, joinTimeUncertain: true } : p,
			),
		});
		expect(unknown).toContain("1시간 11분+");
	});

	it("나간 사람은 시각 불명이어도 퇴장 시각을 보여준다", () => {
		const unknown = render({
			...snapshot,
			participants: snapshot.participants.map((p) => ({
				...p,
				joinTimeUncertain: true,
			})),
		});
		// 오프라인 항목(김동현)은 퇴장 기준이라 그대로 나온다
		expect(unknown).toContain("12분 전 퇴장");
	});

	it("상태 메시지를 보여준다", () => {
		expect(html).toContain("집중 중");
	});

	it("상태 메시지가 없으면 추가 버튼을 둔다", () => {
		expect(html).toContain("+ 상태");
	});

	const withStatus = (message: string) =>
		render({
			...snapshot,
			participants: snapshot.participants.map((p) =>
				p.participantUuid === "p1" ? { ...p, statusMessage: message } : p,
			),
		});

	it("상태 메시지가 길어질수록 글자를 줄인다", () => {
		expect(withStatus("집중")).toContain("status--len1");
		expect(withStatus("이번주까지 마감")).toContain("status--len2");
		expect(withStatus("이번주까지 논문 마감이라")).toContain("status--len3");
		expect(withStatus("이번주까지 논문 마감이라 정신이 없음")).toContain(
			"status--len4",
		);
	});

	it("타일에는 주소 대신 표시만 남긴다", () => {
		// 90px 안에 주소를 담을 수 없다. 진짜 링크는 프로필 카드에 있다.
		const html = withStatus("공부 브금 youtu.be/dQw4w9WgXcQ");

		expect(html).toContain("공부 브금");
		expect(html).toContain("status__link");
		expect(html).not.toContain("youtu.be/dQw4w9WgXcQ");
		// 타일에서는 링크를 열지 않는다
		expect(html).not.toContain("<a");
	});

	it("유튜브가 아닌 주소는 표시를 남기지 않는다", () => {
		// 상태 메시지는 아무나 쓸 수 있다. 아무 주소나 열어주면 피싱에 쓰인다
		const html = withStatus("여기 봐 https://evil.example.com/x");

		expect(html).not.toContain("status__link");
		expect(html).toContain("evil.example.com");
	});

	it("긴 상태 메시지도 타일 안에서 줄바꿈으로 받는다", () => {
		// 호버 말풍선은 두지 않는다. 잘리면 잘린 채로 둔다.
		const long = withStatus("이번주까지 논문 마감이라 정신이 없음");
		expect(long).toContain("이번주까지 논문 마감이라 정신이 없음");
		expect(long).not.toContain("data-full");
	});

	it("확인 창은 처음에 떠 있지 않다", () => {
		expect(html).not.toContain("본인입니까");
	});

	it("알림은 처음에 떠 있지 않다", () => {
		expect(html).not.toContain("toast--");
	});

	it("테마 토글이 있다", () => {
		expect(html).toContain("theme-toggle");
		expect(html).toContain("화면 테마");
	});

	it("세션 총 참여 인원을 최상단에 보여준다", () => {
		expect(html).toContain("누적 4명");
		// 헤더의 큰 숫자보다 위에 온다
		expect(html.indexOf("topbar__total")).toBeLessThan(html.indexOf("header__count"));
	});

	it("회의가 시작된 날짜와 시각을 보여준다", () => {
		const html = render(snapshot);
		expect(html).toContain("topbar__started");
		expect(html).toContain("8월 30일");
		expect(html).toContain("시작");
	});

	it("추정값이면 회의 시작이라고 단정하지 않는다", () => {
		// 서버가 늦게 켜졌다면 실제 시작은 이 시각보다 이르다.
		const html = render({ ...snapshot, startedAtEstimated: true });
		expect(html).toContain("기록 시작");
		expect(html).not.toContain("회의 시작");
	});

	it("정확한 값이면 회의 시작이라고 적는다", () => {
		expect(html).toContain("회의 시작");
	});

	it("회의를 연 사람을 함께 보여준다", () => {
		expect(html).toContain("현승곤 start~");
	});

	it("문 연 사람을 모르면 그 부분을 그리지 않는다", () => {
		// 서버가 늦게 켜져 첫 입장을 놓친 경우다. 목록의 첫 사람을
		// 문 연 사람이라고 부르면 틀린 사람을 지목하게 된다.
		const unknown = render({ ...snapshot, openedBy: null });
		expect(unknown).not.toContain("start~");
	});

	it("시작 시각을 모르면 아예 그리지 않는다", () => {
		const html = render({ ...snapshot, startedAt: null });
		expect(html).not.toContain("topbar__started");
	});

	it("나간 사람이 없으면 오프라인 구역을 그리지 않는다", () => {
		const onlyOnline = render({
			...snapshot,
			totalCount: 3,
			participants: snapshot.participants.filter((p) => p.isPresent),
		});
		expect(onlyOnline).toContain("section--online");
		expect(onlyOnline).not.toContain("section--offline");
	});

	it("참가자 이름을 보여준다", () => {
		expect(html).toContain("조하나");
		expect(html).toContain("참가자02");
	});

	it("이름이 없으면 대체 문구를 보여준다", () => {
		expect(html).toContain("이름 없음");
	});

	it("누적 접속 시간을 보여준다", () => {
		expect(html).toContain("1시간 11분");
	});

	it("1시간을 넘기면 불이 붙는다", () => {
		// p1 은 71분이라 2단계. p2·p3 는 아직 불이 없다
		expect(html).toContain("card__icon--tier2");
		expect(html).toContain("card__icon--tier0");
		expect(html).toContain("🔥");
	});

	it("1시간 전에는 불이 붙지 않는다", () => {
		const warmup = render({
			...snapshot,
			participants: snapshot.participants.map((p) =>
				p.participantUuid === "p1" ? { ...p, onlineSeconds: 40 * 60 } : p,
			),
		});
		expect(warmup).toContain("card__icon--tier1");
		expect(warmup).not.toContain("🔥");
	});

	const withOnlineSeconds = (seconds: number) =>
		render({
			...snapshot,
			participants: snapshot.participants.map((p) =>
				p.participantUuid === "p1" ? { ...p, onlineSeconds: seconds } : p,
			),
		});

	it("3시간을 넘기면 카드 배경이 달아오른다", () => {
		expect(withOnlineSeconds(3 * 3600)).toContain("card--tier3");
	});

	it("5시간을 넘기면 불꽃이 파래진다", () => {
		const blue = withOnlineSeconds(5 * 3600);
		expect(blue).toContain("card--tier4");
		expect(blue).toContain("card__icon--tier4");
	});

	it("나간 지 얼마 안 되면 커피, 오래되면 잠든다", () => {
		const rested = (minutesAgo: number) =>
			render({
				...snapshot,
				participants: snapshot.participants.map((p) =>
					p.participantUuid === "p4"
						? {
								...p,
								lastOccurredAt: new Date(
									now - minutesAgo * 60_000,
								).toISOString(),
							}
						: p,
				),
			});

		expect(rested(30)).toContain("☕");
		expect(rested(90)).toContain("🥱");
		expect(rested(240)).toContain("😴");
		expect(rested(400)).toContain("💤");
	});

	it("마지막 갱신 시각을 보여준다", () => {
		expect(html).toContain("기준");
	});

	it("접속 중인 사람이 없으면 빈 상태 문구를 보여준다", () => {
		const empty = render({ ...snapshot, count: 0, totalCount: 0, participants: [] });
		expect(empty).toContain("접속 중인 사람이 없습니다");
	});

	it("전원 퇴장이면 온라인 구역은 빈 문구, 오프라인 구역에 전원이 남는다", () => {
		const allLeft = render({
			...snapshot,
			count: 0,
			participants: snapshot.participants.map((p) => ({ ...p, isPresent: false })),
		});
		expect(allLeft).toContain("접속 중인 사람이 없습니다");
		expect(allLeft).toContain("section--offline");
		expect(allLeft).toContain("조하나");
	});

	it("데이터가 없으면 로딩 문구를 보여준다", () => {
		expect(render(undefined)).toContain("불러오는 중");
	});
});
