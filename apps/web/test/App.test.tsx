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

const snapshot: PresenceSnapshot = {
	meetingId: "10000000001",
	meetingUuid: "TESTUUID0004==",
	count: 12,
	updatedAt: new Date(Date.now() - 3000).toISOString(),
	participants: [
		{
			participantUuid: "p1",
			displayName: "조하나",
			firstJoinedAt: new Date(Date.now() - 72 * 60_000).toISOString(),
		},
		{
			participantUuid: "p2",
			displayName: "참가자02",
			firstJoinedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
		},
		{
			participantUuid: "p3",
			displayName: null,
			firstJoinedAt: new Date().toISOString(),
		},
	],
};

describe("App", () => {
	const html = render(snapshot);

	it("접속 인원수를 보여준다", () => {
		expect(html).toContain("접속 중");
		expect(html).toContain("12");
		expect(html).toContain("명");
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

	it("아무도 없으면 빈 상태 문구를 보여준다", () => {
		const empty = render({ ...snapshot, count: 0, participants: [] });
		expect(empty).toContain("접속 중인 사람이 없습니다");
	});

	it("데이터가 없으면 로딩 문구를 보여준다", () => {
		expect(render(undefined)).toContain("불러오는 중");
	});
});
