import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminNotice, AuthUser } from "../src/api.ts";
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

function openNoticesTab(): void {
	Object.defineProperty(globalThis, "window", {
		value: { location: { search: "?tab=notices" } },
		configurable: true,
		writable: true,
	});
}

function notice(body: string, isActive: boolean, sortOrder: number): AdminNotice {
	return {
		id: `n-${sortOrder}`,
		body,
		sortOrder,
		isActive,
		updatedAt: "2026-09-12T10:00:00Z",
	};
}

function render(notices?: AdminNotice[]): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(["me"], me);
	if (notices) client.setQueryData(["adminNotices"], notices);

	return renderToString(
		createElement(QueryClientProvider, { client }, createElement(Admin)),
	);
}

const SAMPLE = [
	notice("닉네임 매핑이 필요하면 조하나에게 연락해주세요", true, 0),
	notice("옛날 공지", false, 1),
];

describe("공지 탭", () => {
	it("탭 목록에 공지가 있다", () => {
		expect(render()).toContain("공지");
	});

	it("공지를 보여준다", () => {
		openNoticesTab();
		expect(render(SAMPLE)).toContain("닉네임 매핑이 필요하면");
	});

	it("내린 공지도 함께 보여준다 — 되살릴 수 있어야 한다", () => {
		openNoticesTab();
		const html = render(SAMPLE);

		expect(html).toContain("옛날 공지");
		expect(html).toContain("notice--off");
	});

	it("지금 몇 개가 보이는 중인지 알려준다", () => {
		openNoticesTab();
		// SSR 이 숫자 앞뒤에 주석을 끼우므로 태그를 걷어내고 본다
		const text = render(SAMPLE).replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");

		// 둘 중 하나만 켜져 있다
		expect(text).toContain("지금 1개가 보이는 중");
	});

	it("맨 위 공지는 더 올릴 수 없다", () => {
		openNoticesTab();
		const html = render(SAMPLE);
		const firstRow = html.slice(html.indexOf("닉네임 매핑"));

		expect(firstRow).toContain("disabled");
	});

	it("로그인 전에는 공지도 보이지 않는다", () => {
		openNoticesTab();
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(["me"], null);
		const html = renderToString(
			createElement(QueryClientProvider, { client }, createElement(Admin)),
		);

		expect(html).not.toContain("닉네임 매핑");
		expect(html).toContain("로그인");
	});
});
