import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Admin from "../src/Logs.tsx";

function render(): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return renderToString(
		createElement(QueryClientProvider, { client }, createElement(Admin)),
	);
}

describe("어드민", () => {
	it("접근 키가 없으면 안내만 보여준다", () => {
		const html = render();
		expect(html).toContain("접근 키가 필요합니다");
		// 키 없이 목록이 그려지면 안 된다
		expect(html).not.toContain("log__head");
	});

	it("키 안내에 사용법을 적는다", () => {
		expect(render()).toContain("?key=");
	});

	it("키가 없으면 탭도 그리지 않는다", () => {
		// 탭 자체가 참가자 이름이 있다는 사실을 흘린다
		const html = render();
		expect(html).not.toContain("tab--on");
		expect(html).not.toContain("사람");
	});
});

describe("어드민 (키 있음)", () => {
	function renderWithKey(): string {
		const original = globalThis.window;
		// readKey 는 window.location.search 를 읽는다
		Object.defineProperty(globalThis, "window", {
			value: { location: { search: "?key=testtoken" } },
			configurable: true,
			writable: true,
		});
		try {
			return render();
		} finally {
			Object.defineProperty(globalThis, "window", {
				value: original,
				configurable: true,
				writable: true,
			});
		}
	}

	it("사람·로그·기록 세 탭을 둔다", () => {
		const html = renderWithKey();
		expect(html).toContain("사람");
		expect(html).toContain("로그");
		expect(html).toContain("기록");
	});

	it("처음에는 사람 탭이 열린다", () => {
		// 어드민을 여는 이유는 대개 사람을 합치기 위해서다
		const html = renderWithKey();
		expect(html).toContain("같은 사람의 행을 고르고");
	});
});
