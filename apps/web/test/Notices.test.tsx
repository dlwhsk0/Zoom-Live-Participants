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

function notice(
	body: string,
	isActive: boolean,
	sortOrder: number,
	extra: Partial<AdminNotice> = {},
): AdminNotice {
	return {
		id: `n-${sortOrder}`,
		body,
		category: "general",
		sortOrder,
		isActive,
		startsAt: null,
		endsAt: null,
		updatedAt: "2026-09-12T10:00:00Z",
		...extra,
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

	it("메인 공지에는 표를 붙인다", () => {
		openNoticesTab();
		const html = render([notice("긴급 공지", true, 0, { category: "main" })]);

		expect(html).toContain("메인");
	});

	it("기간이 있으면 언제부터 언제까지인지 보여준다", () => {
		openNoticesTab();
		const html = render([
			notice("설 연휴 안내", true, 0, {
				startsAt: "2026-09-20T00:00:00Z",
				endsAt: "2026-09-25T00:00:00Z",
			}),
		]);

		expect(html).toContain("notice__window");
	});

	it("켜져 있어도 기간 밖이면 보이는 개수에서 뺀다", () => {
		openNoticesTab();
		const html = render([
			notice("아직 멀었다", true, 0, { startsAt: "2099-01-01T00:00:00Z" }),
		]);
		const text = html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");

		expect(text).toContain("지금 0개가 보이는 중");
		expect(html).toContain("기간 밖");
	});

	it("이미 끝난 공지도 보이는 개수에서 뺀다", () => {
		openNoticesTab();
		const html = render([
			notice("지난 공지", true, 0, { endsAt: "2020-01-01T00:00:00Z" }),
		]);
		const text = html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "");

		expect(text).toContain("지금 0개가 보이는 중");
	});

	it("분류와 기간을 고를 수 있다", () => {
		openNoticesTab();
		const html = render([]);

		expect(html).toContain("datetime-local");
		expect(html).toContain("메인");
		expect(html).toContain("일반");
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
