import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Stats as StatsData } from "../src/api.ts";
import Stats, { hours } from "../src/Stats.tsx";

function render(data?: StatsData): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	if (data) client.setQueryData(["stats", 14], data);

	return renderToString(
		createElement(QueryClientProvider, { client }, createElement(Stats)),
	);
}

const EMPTY: StatsData = {
	from: "2026-09-01",
	to: "2026-09-14",
	days: [{ date: "2026-09-01", people: 0, seconds: 0, peak: 0 }],
	hours: Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0 })),
	weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, seconds: 0, days: 2 })),
	people: [],
	totalSeconds: 0,
	totalPeople: 0,
};

describe("시간 표기", () => {
	it("시간 단위로 줄인다", () => {
		expect(hours(3 * 3600)).toBe("3.0시간");
		expect(hours(20 * 3600)).toBe("20시간");
	});

	it("한 시간 안쪽은 분으로", () => {
		expect(hours(25 * 60)).toBe("25분");
	});

	it("1분이 안 되면 0분이라고 하지 않는다 — 고장으로 읽힌다", () => {
		expect(hours(20)).toBe("1분 미만");
		expect(hours(0)).toBe("0");
	});
});

describe("통계 화면", () => {
	it("네 구역을 모두 그린다", () => {
		const html = render({
			...EMPTY,
			days: [{ date: "2026-09-09", people: 3, seconds: 7200, peak: 2 }],
			hours: EMPTY.hours.map((h) => (h.hour === 22 ? { ...h, seconds: 7200 } : h)),
			people: [{ displayName: "김하나", seconds: 7200, days: 1 }],
			totalSeconds: 7200,
			totalPeople: 3,
		});

		expect(html).toContain("날짜별");
		expect(html).toContain("시간대별");
		expect(html).toContain("요일별");
		expect(html).toContain("사람별");
		expect(html).toContain("김하나");
		// 요약에 가장 붐빈 시간이 뜬다
		expect(html).toContain("가장 붐빈 시간 22시");
	});

	it("기록이 없어도 화면이 선다", () => {
		const html = render(EMPTY);

		expect(html).toContain("기록이 없습니다");
		expect(html).not.toContain("가장 붐빈 시간");
	});

	it("불러오는 동안 숫자를 만들어내지 않는다", () => {
		const html = render();

		expect(html).toContain("불러오는 중");
		expect(html).not.toContain("누적");
	});
});
