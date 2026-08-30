import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Logs from "../src/Logs.tsx";

function render(): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return renderToString(
		createElement(QueryClientProvider, { client }, createElement(Logs)),
	);
}

describe("Logs", () => {
	it("접근 키가 없으면 안내만 보여준다", () => {
		const html = render();
		expect(html).toContain("접근 키가 필요합니다");
		// 키 없이 목록이 그려지면 안 된다
		expect(html).not.toContain("log__head");
	});

	it("키 안내에 사용법을 적는다", () => {
		expect(render()).toContain("?key=");
	});
});
