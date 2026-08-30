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
	updatedAt: new Date(now - 3000).toISOString(),
	participants: [
		{
			participantUuid: "p1",
			displayName: "조하나",
			firstJoinedAt: new Date(now - 72 * 60_000).toISOString(),
			isPresent: true,
			lastOccurredAt: new Date(now - 60_000).toISOString(),
		},
		{
			participantUuid: "p2",
			displayName: "참가자02",
			firstJoinedAt: new Date(now - 4 * 60_000).toISOString(),
			isPresent: true,
			lastOccurredAt: new Date(now - 30_000).toISOString(),
		},
		{
			participantUuid: "p3",
			displayName: null,
			firstJoinedAt: new Date(now).toISOString(),
			isPresent: true,
			lastOccurredAt: new Date(now).toISOString(),
		},
		{
			participantUuid: "p4",
			displayName: "김동현",
			firstJoinedAt: new Date(now - 40 * 60_000).toISOString(),
			isPresent: false,
			lastOccurredAt: new Date(now - 12 * 60_000).toISOString(),
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
		expect(html).toContain("row--offline");
	});

	it("세션 총 참여 인원을 보여준다", () => {
		expect(html).toContain("지금까지 4명이 참여");
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

	it("접속 경과 시간을 보여준다", () => {
		expect(html).toContain("1시간 12분");
		expect(html).toContain("4분");
		expect(html).toContain("방금");
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
