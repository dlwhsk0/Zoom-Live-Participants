import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Aliases from "../src/Aliases.tsx";
import type { AliasSuggestion, NameAlias } from "../src/api.ts";

function render(
	suggestions: AliasSuggestion[],
	aliases: NameAlias[] = [],
): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(["aliases"], aliases);
	client.setQueryData(["aliasSuggestions"], suggestions);

	return renderToString(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(Aliases, { onToast: () => {} }),
		),
	);
}

const KEVIN: AliasSuggestion = {
	privateIp: "192.168.45.159",
	canonical: "Kevin",
	aliases: [{ name: "Techeer", lastSeenAt: "2026-09-09T16:28:00Z" }],
};

describe("별칭 후보", () => {
	it("묶을 쌍을 보여준다", () => {
		const html = render([KEVIN]);

		expect(html).toContain("Techeer");
		expect(html).toContain("Kevin");
		expect(html).toContain("묶기");
	});

	it("왜 묶자는지 근거를 함께 보여준다", () => {
		// 근거가 없으면 누를 수 없다
		expect(render([KEVIN])).toContain("192.168.45.159");
	});

	it("한 기기에 이름이 셋이면 둘을 제안한다", () => {
		const html = render([
			{
				privateIp: "192.168.219.104",
				canonical: "이용욱",
				aliases: [
					{ name: "이 용욱", lastSeenAt: "2026-09-02T15:50:00Z" },
					{ name: "이용욱/컴퓨터공학전공/학생", lastSeenAt: "2026-09-02T15:45:00Z" },
				],
			},
		]);

		expect(html).toContain("이 용욱");
		expect(html).toContain("이용욱/컴퓨터공학전공/학생");
		expect((html.match(/묶기/g) ?? []).length).toBe(2);
	});

	it("후보가 없으면 제안 영역 자체를 두지 않는다", () => {
		expect(render([])).not.toContain("suggest__row");
	});
});
