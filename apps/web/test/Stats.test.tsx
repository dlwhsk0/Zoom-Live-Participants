import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Stats as StatsData } from "../src/api.ts";
import Stats, { hours, Ranking } from "../src/Stats.tsx";

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
	days: [{ date: "2026-09-01", people: 0, seconds: 0, peak: 0, firstAt: null, lastAt: null }],
	hours: Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0 })),
	weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, seconds: 0, days: 2 })),
	people: [],
	weeks: [],
	months: [],
	week: { recent: { seconds: 0, people: 0 }, previous: { seconds: 0, people: 0 } },
	typicalStart: null,
	typicalEnd: null,
	totalSeconds: 0,
	totalPeople: 0,
};

function person(over: Partial<StatsData["people"][number]> = {}) {
	return {
		displayName: "김하나",
		seconds: 7200,
		days: 1,
		streak: 1,
		streakAlive: true,
		bestStreak: 1,
		daily: [{ date: "2026-09-09", seconds: 7200 }],
		...over,
	};
}

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
	function renderRanking(people: StatsData["people"]): string {
		return renderToString(
			createElement(Ranking, { people, onOpen: () => {} }),
		);
	}

	it("구역을 탭으로 나눈다", () => {
		const html = render({
			...EMPTY,
			days: [{ date: "2026-09-09", people: 3, seconds: 7200, peak: 2, firstAt: "21:00", lastAt: "23:00" }],
			hours: EMPTY.hours.map((h) => (h.hour === 22 ? { ...h, seconds: 7200 } : h)),
			people: [person()],
			typicalStart: "21:00",
			typicalEnd: "23:00",
			totalSeconds: 7200,
			totalPeople: 3,
		});

		// 탭 이름
		expect(html).toContain("일별");
		expect(html).toContain("주별");
		expect(html).toContain("월별");
		expect(html).toContain("패턴");
		expect(html).toContain("랭킹");
		// 요약은 탭과 무관하게 늘 보인다
		expect(html).toContain("붐비는 시간 22시");
		expect(html).toContain("21:00");
	});

	it("처음에는 일별을 보여준다 — 처음에 물어본 것이 그쪽이다", () => {
		const html = render({
			...EMPTY,
			days: [{ date: "2026-09-09", people: 3, seconds: 7200, peak: 2, firstAt: "21:00", lastAt: "23:00" }],
			people: [person()],
		});

		// 기록이 있는 날만 고를 수 있게 칩으로 내놓는다
		expect(html).toContain("daypick__day");
		expect(html).toContain("09-09");
		// 랭킹 탭을 고르기 전에는 사람 목록이 나오지 않는다
		expect(html).not.toContain("rank__row");
	});

	it("기록이 없는 날은 고를 수 없다", () => {
		const html = render({
			...EMPTY,
			days: [
				{ date: "2026-09-08", people: 0, seconds: 0, peak: 0, firstAt: null, lastAt: null },
				{ date: "2026-09-09", people: 3, seconds: 7200, peak: 2, firstAt: "21:00", lastAt: "23:00" },
			],
		});

		expect(html).toContain("09-09");
		expect(html).not.toContain("09-08");
	});

	it("설명 문장을 늘어놓지 않는다", () => {
		const html = render({ ...EMPTY, people: [person()] });

		expect(html).not.toContain("막대는");
		expect(html).not.toContain("하루 평균 낸");
		expect(html).not.toContain("한 번만 센다");
	});

	it("이어지는 중일 때만 연속을 자랑한다", () => {
		expect(renderRanking([person({ streak: 5, streakAlive: true })])).toContain(
			"5일 연속",
		);
		// 끊긴 기록을 "연속" 이라고 부르면 거짓말이 된다
		expect(
			renderRanking([person({ streak: 5, streakAlive: false })]),
		).not.toContain("5일 연속");
	});

	it("1~3위에 메달을 준다", () => {
		const html = renderRanking([
			person({ displayName: "일등", seconds: 300 }),
			person({ displayName: "이등", seconds: 200 }),
			person({ displayName: "삼등", seconds: 100 }),
			person({ displayName: "사등", seconds: 50 }),
		]);

		expect(html).toContain("🥇");
		expect(html).toContain("🥉");
		// 4위부터는 숫자
		expect(html).toContain(">4<");
	});

	it("지난 주와 견준다", () => {
		const html = render({
			...EMPTY,
			week: {
				recent: { seconds: 11 * 3600, people: 3 },
				previous: { seconds: 10 * 3600, people: 3 },
			},
		});

		expect(html).toContain("지난 7일");
		expect(html).toContain("10%");
	});

	it("견줄 지난 주가 없으면 첫 주라고 한다", () => {
		const html = render({
			...EMPTY,
			week: {
				recent: { seconds: 3600, people: 1 },
				previous: { seconds: 0, people: 0 },
			},
		});

		expect(html).toContain("첫 주");
		expect(html).not.toContain("그 전 7일");
	});

	it("기록이 없어도 화면이 선다", () => {
		const html = render(EMPTY);

		expect(html).toContain("일별");
		expect(html).not.toContain("붐비는 시간");
		expect(renderRanking([])).toContain("기록이 없습니다");
	});

	it("불러오는 동안 숫자를 만들어내지 않는다", () => {
		const html = render();

		expect(html).toContain("불러오는 중");
		expect(html).not.toContain("누적");
	});
});

describe("긴 목록", () => {
	function many(n: number) {
		return Array.from({ length: n }, (_, i) =>
			person({ displayName: `사람${i}`, seconds: (n - i) * 60 }),
		);
	}

	it("랭킹을 10명까지만 펼친다 — 다 그리면 아래 구역이 화면 밖으로 밀린다", () => {
		const html = renderToString(
			createElement(Ranking, { people: many(76), onOpen: () => {} }),
		);

		expect(html).toContain("사람0");
		expect(html).toContain("사람9");
		expect(html).not.toContain("사람10");
		expect(html).toContain("66명 더 보기");
	});

	it("열 명 이하면 더 보기를 두지 않는다", () => {
		const html = renderToString(
			createElement(Ranking, { people: many(4), onOpen: () => {} }),
		);

		expect(html).not.toContain("더 보기");
	});

	it("일별 탭이 랭킹 탭보다 먼저 온다 — 처음에 물어본 것이 그쪽이다", () => {
		const html = render({ ...EMPTY, people: many(3) });

		expect(html.indexOf("일별")).toBeLessThan(html.indexOf("랭킹"));
	});

	it("일별 탭에서는 통계 막대를 그리지 않는다 — 그날의 화면이다", () => {
		const html = render({
			...EMPTY,
			days: [{ date: "2026-09-09", people: 3, seconds: 7200, peak: 2, firstAt: "21:00", lastAt: "23:00" }],
			weeks: [{ key: "2026-09-07", seconds: 7200, people: 3, activeDays: 1 }],
		});

		expect(html).not.toContain("chart__row");
	});
});
