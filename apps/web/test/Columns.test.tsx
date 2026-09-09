import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Columns from "../src/Columns.tsx";

function render(props: Parameters<typeof Columns>[0]): string {
	return renderToString(createElement(Columns, props));
}

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
	key: String(hour),
	label: String(hour),
	value: hour === 23 ? 100 : hour,
}));

describe("세로 막대", () => {
	it("가장 높은 칸을 따로 표시한다", () => {
		const html = render({ items: HOURS, format: (v) => `${v}시간` });

		expect(html).toContain("cols__bar--peak");
		// 봉우리는 하나뿐이어야 한다
		expect(html.split("cols__bar--peak").length - 1).toBe(1);
	});

	it("값은 그림 아래 한 줄로 적는다 — 막대 위에 얹으면 끝 칸에서 잘린다", () => {
		const html = render({
			items: HOURS,
			format: (v) => `${v}시간`,
			peakLabel: "가장 붐비는 시간",
		});

		expect(html).toContain("가장 붐비는 시간 23 · 100시간");
	});

	it("라벨을 몇 칸마다 적을지 정할 수 있다 — 24칸을 다 적을 수는 없다", () => {
		const html = render({ items: HOURS, format: String, labelEvery: 3 });

		expect(html).toContain(">0<");
		expect(html).toContain(">3<");
		// 1, 2 는 비워 둔다
		expect(html).not.toContain(">1<");
	});

	it("기록이 없으면 봉우리도 없다", () => {
		const html = render({
			items: [{ key: "a", label: "a", value: 0 }],
			format: String,
			peakLabel: "가장",
		});

		expect(html).not.toContain("cols__bar--peak");
		expect(html).not.toContain("가장");
	});

	it("높이는 가장 큰 값에 견준 비율이다", () => {
		const html = render({
			items: [
				{ key: "a", label: "a", value: 50 },
				{ key: "b", label: "b", value: 100 },
			],
			format: String,
		});

		expect(html).toContain("height:50%");
		expect(html).toContain("height:100%");
	});
});
