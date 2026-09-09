import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NotFound from "../src/NotFound.tsx";

describe("없는 주소", () => {
	const html = renderToString(createElement(NotFound));

	it("404 임을 알린다", () => {
		expect(html).toContain("404");
		expect(html).toContain("없는 주소");
	});

	it("참가자 화면으로 돌아갈 길을 준다", () => {
		expect(html).toContain('href="/"');
	});

	it("무엇이 있는지 흘리지 않는다", () => {
		// 여기서 어드민을 언급하면 주소를 감춘 의미가 없다
		expect(html).not.toContain("어드민");
		expect(html).not.toContain("로그인");
		expect(html).not.toContain("admin");
	});
});
