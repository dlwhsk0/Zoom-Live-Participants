import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthUser } from "../src/api.ts";
import Admin from "../src/Logs.tsx";

/**
 * 로그인 상태를 캐시에 미리 넣어 렌더한다.
 *
 * undefined 를 넣으면 "아직 확인 중", null 이면 "로그인 안 됨",
 * 사용자 객체면 "로그인됨" 이다. 실제 요청은 나가지 않는다.
 */
function render(me?: AuthUser | null): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	if (me !== undefined) client.setQueryData(["me"], me);

	return renderToString(
		createElement(QueryClientProvider, { client }, createElement(Admin)),
	);
}

describe("어드민 — 로그인 전", () => {
	it("확인하는 동안 아무것도 흘리지 않는다", () => {
		const html = render();
		expect(html).toContain("확인하는 중");
		expect(html).not.toContain("log__head");
		// 탭 이름 자체가 참가자 데이터가 있다는 사실을 흘린다
		expect(html).not.toContain("tab--on");
	});

	it("로그인하지 않았으면 로그인 폼을 보여준다", () => {
		const html = render(null);
		expect(html).toContain("로그인");
		expect(html).toContain("아이디");
		expect(html).toContain("비밀번호");
	});

	it("로그인 폼에서도 목록이나 탭이 보이지 않는다", () => {
		const html = render(null);
		expect(html).not.toContain("log__head");
		expect(html).not.toContain("tab--on");
		expect(html).not.toContain("같은 사람의 행을 고르고");
	});

	it("주소의 ?key= 로는 더 이상 열리지 않는다", () => {
		const original = globalThis.window;
		Object.defineProperty(globalThis, "window", {
			value: { location: { search: "?key=testtoken" } },
			configurable: true,
			writable: true,
		});
		try {
			// 키가 있어도 로그인 상태가 아니면 폼이다
			expect(render(null)).not.toContain("tab--on");
		} finally {
			Object.defineProperty(globalThis, "window", {
				value: original,
				configurable: true,
				writable: true,
			});
		}
	});
});

describe("어드민 — 로그인 후", () => {
	const me: AuthUser = { username: "hana", role: "admin" };

	it("사람·로그·기록 세 탭을 둔다", () => {
		const html = render(me);
		expect(html).toContain("사람");
		expect(html).toContain("로그");
		expect(html).toContain("기록");
	});

	it("처음에는 사람 탭이 열린다", () => {
		// 어드민을 여는 이유는 대개 사람을 합치기 위해서다
		expect(render(me)).toContain("같은 사람의 행을 고르고");
	});

	it("누구로 들어와 있는지와 나가는 길을 보여준다", () => {
		const html = render(me);
		expect(html).toContain("hana");
		expect(html).toContain("로그아웃");
	});
});
