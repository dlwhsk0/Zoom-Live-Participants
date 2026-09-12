import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthUser, WebhookLogPage } from "../src/api.ts";
import Admin from "../src/Logs.tsx";

const me: AuthUser = { username: "hana", role: "admin" };

const original = globalThis.window;

afterEach(() => {
	Object.defineProperty(globalThis, "window", {
		value: original,
		configurable: true,
		writable: true,
	});
});

/** 탭은 주소에서 읽는다. 렌더 전에 window 를 갈아 끼운다. */
function openTab(tab: string): void {
	Object.defineProperty(globalThis, "window", {
		value: { location: { search: `?tab=${tab}` } },
		configurable: true,
		writable: true,
	});
}

function render(page?: WebhookLogPage): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(["me"], me);
	if (page) {
		// 무한 스크롤 캐시는 페이지 배열 모양이다
		client.setQueryData(["webhook-log", null], {
			pages: [page],
			pageParams: [null],
		});
	}

	return renderToString(
		createElement(QueryClientProvider, { client }, createElement(Admin)),
	);
}

const roleChanged: WebhookLogPage = {
	entries: [
		{
			id: "e1",
			receivedAt: "2026-09-12T09:35:10Z",
			event: "meeting.participant_role_changed",
			meetingUuid: "TESTUUID0001==",
			payload: {
				event: "meeting.participant_role_changed",
				payload: {
					object: {
						uuid: "TESTUUID0001==",
						participant: {
							user_name: "조하나",
							old_role: "attendee",
							new_role: "host",
						},
					},
				},
			},
		},
		{
			id: "e2",
			receivedAt: "2026-09-12T09:30:00Z",
			event: "meeting.participant_joined_breakout_room",
			meetingUuid: "TESTUUID0001==",
			payload: {
				event: "meeting.participant_joined_breakout_room",
				payload: { object: { participant: { user_name: "김승조" } } },
			},
		},
	],
	nextCursor: null,
	counts: [
		{ event: "meeting.participant_left", count: 2253 },
		{ event: "meeting.participant_role_changed", count: 258 },
	],
};

describe("웹훅 탭", () => {
	it("탭 목록에 웹훅이 있다", () => {
		expect(render()).toContain("웹훅");
	});

	it("이벤트 이름을 그대로 보여준다 — 입퇴장만이 아니다", () => {
		openTab("webhook");
		const html = render(roleChanged);

		expect(html).toContain("participant_role_changed");
		expect(html).toContain("participant_joined_breakout_room");
	});

	it("meeting. 접두사는 떼어낸다 — 모든 이벤트에 똑같이 붙어 있다", () => {
		openTab("webhook");
		expect(render(roleChanged)).not.toContain("meeting.participant_role_changed<");
	});

	it("역할 이벤트는 누가 무엇이 되었는지 한 줄로 보여준다", () => {
		openTab("webhook");
		const html = render(roleChanged);

		expect(html).toContain("조하나");
		expect(html).toContain("attendee → host");
	});

	it("종류별 건수를 거르개로 보여준다", () => {
		openTab("webhook");
		const html = render(roleChanged);

		expect(html).toContain("전체");
		expect(html).toContain("participant_role_changed 258");
	});

	it("로그인 전에는 웹훅 탭도 열리지 않는다", () => {
		openTab("webhook");
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(["me"], null);
		const html = renderToString(
			createElement(QueryClientProvider, { client }, createElement(Admin)),
		);

		expect(html).not.toContain("participant_role_changed");
		expect(html).toContain("로그인");
	});
});
