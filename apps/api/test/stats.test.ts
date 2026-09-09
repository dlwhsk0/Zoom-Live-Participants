import { describe, expect, it } from "vitest";

import {
	buildStats,
	kstDate,
	kstHour,
	kstWeekday,
	peakConcurrent,
	streakOf,
	type PersonIntervals,
} from "../src/domain/stats.ts";

/** 한국 시간으로 읽히는 시각을 만든다. */
function kst(iso: string): Date {
	return new Date(`${iso}+09:00`);
}

const NOW = kst("2026-09-10T12:00:00");

function person(displayName: string, ...pairs: [string, string | null][]): PersonIntervals {
	return {
		displayName,
		intervals: pairs.map(([start, end]) => ({
			start: kst(start),
			end: end === null ? null : kst(end),
		})),
	};
}

describe("한국 시간 변환", () => {
	it("UTC 로 날짜가 밀리지 않는다", () => {
		// UTC 로는 9월 9일 저녁이지만 한국은 이미 10일이다
		expect(kstDate(kst("2026-09-10T01:00:00").getTime())).toBe("2026-09-10");
	});

	it("자정 직전과 직후를 다른 날로 본다", () => {
		expect(kstDate(kst("2026-09-09T23:59:59").getTime())).toBe("2026-09-09");
		expect(kstDate(kst("2026-09-10T00:00:00").getTime())).toBe("2026-09-10");
	});

	it("시와 요일도 한국 기준이다", () => {
		expect(kstHour(kst("2026-09-10T02:30:00").getTime())).toBe(2);
		// 2026-09-10 은 목요일
		expect(kstWeekday(kst("2026-09-10T02:30:00").getTime())).toBe(4);
	});
});

describe("최대 동시 접속", () => {
	it("겹친 만큼 센다", () => {
		expect(
			peakConcurrent([
				{ from: 0, to: 100 },
				{ from: 50, to: 150 },
				{ from: 60, to: 70 },
			]),
		).toBe(3);
	});

	it("한 명이 나가고 다음이 들어오면 1이다 — 교대는 겹침이 아니다", () => {
		expect(
			peakConcurrent([
				{ from: 0, to: 100 },
				{ from: 100, to: 200 },
			]),
		).toBe(1);
	});

	it("아무도 없으면 0", () => {
		expect(peakConcurrent([])).toBe(0);
	});
});

describe("통계", () => {
	const from = kst("2026-09-07T00:00:00");
	const to = kst("2026-09-10T00:00:00");

	it("사람이 겹쳐 접속해도 시간을 두 번 세지 않는다", () => {
		// 노트북 9~11시, 폰 10~12시. 실제로 머문 것은 3시간이다.
		const stats = buildStats(
			[person("김하나", ["2026-09-07T09:00:00", "2026-09-07T11:00:00"], ["2026-09-07T10:00:00", "2026-09-07T12:00:00"])],
			from, to, NOW,
		);

		expect(stats.totalSeconds).toBe(3 * 3600);
		expect(stats.people[0]).toMatchObject({
			displayName: "김하나",
			seconds: 3 * 3600,
			days: 1,
		});
	});

	it("자정을 넘긴 접속을 두 날로 나눈다", () => {
		const stats = buildStats(
			[person("김하나", ["2026-09-07T22:00:00", "2026-09-08T02:00:00"])],
			from, to, NOW,
		);

		const day7 = stats.days.find((d) => d.date === "2026-09-07");
		const day8 = stats.days.find((d) => d.date === "2026-09-08");

		expect(day7?.seconds).toBe(2 * 3600);
		expect(day8?.seconds).toBe(2 * 3600);
		// 같은 사람이지만 이틀 다 나온 것으로 센다
		expect(stats.people[0]?.days).toBe(2);
	});

	it("시간대를 지나간 만큼 나눠 담는다 — 들어온 시각에 몰지 않는다", () => {
		const stats = buildStats(
			[person("김하나", ["2026-09-07T22:30:00", "2026-09-08T01:15:00"])],
			from, to, NOW,
		);

		const at = (hour: number) => stats.hours.find((h) => h.hour === hour)?.seconds;

		expect(at(22)).toBe(30 * 60);
		expect(at(23)).toBe(3600);
		expect(at(0)).toBe(3600);
		expect(at(1)).toBe(15 * 60);
		expect(at(2)).toBe(0);
	});

	it("기간 밖은 잘라낸다", () => {
		// 기간 시작 전부터 있었다면 시작 시점부터만 센다
		const stats = buildStats(
			[person("김하나", ["2026-09-06T22:00:00", "2026-09-07T02:00:00"])],
			from, to, NOW,
		);

		expect(stats.totalSeconds).toBe(2 * 3600);
	});

	it("아무도 안 온 날도 0 으로 남긴다", () => {
		const stats = buildStats(
			[person("김하나", ["2026-09-07T09:00:00", "2026-09-07T10:00:00"])],
			from, to, NOW,
		);

		expect(stats.days).toHaveLength(3);
		expect(stats.days.find((d) => d.date === "2026-09-08")).toEqual({
			date: "2026-09-08",
			people: 0,
			seconds: 0,
			peak: 0,
			firstAt: null,
			lastAt: null,
		});
	});

	it("같은 날 여러 명이면 인원과 최대 동시접속을 함께 낸다", () => {
		const stats = buildStats(
			[
				person("김하나", ["2026-09-07T09:00:00", "2026-09-07T12:00:00"]),
				person("이도윤", ["2026-09-07T10:00:00", "2026-09-07T11:00:00"]),
				person("박서준", ["2026-09-07T13:00:00", "2026-09-07T14:00:00"]),
			],
			from, to, NOW,
		);

		const day = stats.days.find((d) => d.date === "2026-09-07");
		expect(day?.people).toBe(3);
		// 9~12 와 10~11 이 겹치는 동안 2명, 박서준은 떨어져 있다
		expect(day?.peak).toBe(2);
		expect(stats.totalPeople).toBe(3);
	});

	it("사람은 많이 한 순으로 준다", () => {
		const stats = buildStats(
			[
				person("적게", ["2026-09-07T09:00:00", "2026-09-07T10:00:00"]),
				person("많이", ["2026-09-07T09:00:00", "2026-09-07T15:00:00"]),
			],
			from, to, NOW,
		);

		expect(stats.people.map((p) => p.displayName)).toEqual(["많이", "적게"]);
	});

	it("아직 안 나간 사람은 now 까지로 본다", () => {
		const stats = buildStats(
			[person("김하나", ["2026-09-09T10:00:00", null])],
			kst("2026-09-09T00:00:00"),
			kst("2026-09-11T00:00:00"),
			kst("2026-09-09T12:00:00"),
		);

		expect(stats.totalSeconds).toBe(2 * 3600);
	});

	it("요일별로 그 요일이 몇 번 있었는지 함께 준다", () => {
		const stats = buildStats([], from, to, NOW);
		// 9/7 월, 9/8 화, 9/9 수
		expect(stats.weekdays.find((w) => w.weekday === 1)?.days).toBe(1);
		expect(stats.weekdays.find((w) => w.weekday === 0)?.days).toBe(0);
	});

	it("새벽까지 이어진 모임을 하룻밤으로 본다", () => {
		// 9/7 밤 10시에 모여 9/8 새벽 2시에 흩어졌다. 한 번의 모임이다.
		const stats = buildStats(
			[person("밤샘", ["2026-09-07T22:00:00", "2026-09-08T02:00:00"])],
			from, to, NOW,
		);

		const day = stats.days.find((d) => d.date === "2026-09-07");
		expect(day?.firstAt).toBe("22:00");
		// 자정으로 잘랐다면 끝이 23:59 로 보였을 것이다
		expect(day?.lastAt).toBe("02:00");

		// 다음날에는 첫·마지막이 잡히지 않는다. 그 밤의 몫이 아니다.
		const next = stats.days.find((d) => d.date === "2026-09-08");
		expect(next?.firstAt).toBeNull();
	});

	it("새벽 5시가 지나면 새 날의 시작이다", () => {
		const stats = buildStats(
			[person("아침형", ["2026-09-08T06:00:00", "2026-09-08T08:00:00"])],
			from, to, NOW,
		);

		expect(stats.days.find((d) => d.date === "2026-09-08")?.firstAt).toBe("06:00");
	});

	it("보통 시작·종료 시각은 밤별 값의 중앙값이다", () => {
		const stats = buildStats(
			[
				person("사람",
					["2026-09-07T20:00:00", "2026-09-07T22:00:00"],
					["2026-09-08T21:00:00", "2026-09-08T23:00:00"],
					["2026-09-09T22:00:00", "2026-09-09T23:30:00"],
				),
			],
			from, to, NOW,
		);

		expect(stats.typicalStart).toBe("21:00");
		expect(stats.typicalEnd).toBe("23:00");
	});

	it("기록이 없어도 형태는 유지한다", () => {
		const stats = buildStats([], from, to, NOW);

		expect(stats.hours).toHaveLength(24);
		expect(stats.weekdays).toHaveLength(7);
		expect(stats.people).toEqual([]);
		expect(stats.totalSeconds).toBe(0);
	});
});

describe("연속 출석", () => {
	it("이어진 날을 센다", () => {
		const run = streakOf(
			["2026-09-08", "2026-09-09", "2026-09-10"],
			"2026-09-10",
		);

		expect(run).toEqual({ streak: 3, alive: true, best: 3 });
	});

	it("어제까지만 나왔어도 살아 있다 — 오늘은 아직 안 끝났다", () => {
		const run = streakOf(["2026-09-08", "2026-09-09"], "2026-09-10");

		expect(run.streak).toBe(2);
		expect(run.alive).toBe(true);
	});

	it("그제가 마지막이면 끊긴 것이다", () => {
		const run = streakOf(["2026-09-07", "2026-09-08"], "2026-09-10");

		expect(run.streak).toBe(2);
		expect(run.alive).toBe(false);
	});

	it("중간이 비면 거기서 끊고 다시 센다", () => {
		const run = streakOf(
			["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-09", "2026-09-10"],
			"2026-09-10",
		);

		// 최근 연속은 2일, 가장 길었던 것은 3일
		expect(run.streak).toBe(2);
		expect(run.best).toBe(3);
		expect(run.alive).toBe(true);
	});

	it("하루만 나와도 1일이다", () => {
		expect(streakOf(["2026-09-10"], "2026-09-10")).toEqual({
			streak: 1, alive: true, best: 1,
		});
	});

	it("기록이 없으면 0", () => {
		expect(streakOf([], "2026-09-10")).toEqual({ streak: 0, alive: false, best: 0 });
	});

	it("같은 날이 여러 번 들어와도 하루로 센다", () => {
		expect(streakOf(["2026-09-10", "2026-09-10"], "2026-09-10").streak).toBe(1);
	});

	it("달을 넘겨도 이어진다", () => {
		const run = streakOf(["2026-08-31", "2026-09-01"], "2026-09-01");
		expect(run.streak).toBe(2);
	});
});

describe("주간 비교", () => {
	const now = kst("2026-09-10T12:00:00");

	it("최근 7일과 그 앞 7일을 나눠 센다", () => {
		const stats = buildStats(
			[
				// 최근 7일(9/3~9/9) 안
				person("A", ["2026-09-08T10:00:00", "2026-09-08T12:00:00"]),
				// 그 앞 7일(8/27~9/2) 안
				person("B", ["2026-09-01T10:00:00", "2026-09-01T11:00:00"]),
			],
			kst("2026-08-27T00:00:00"),
			kst("2026-09-11T00:00:00"),
			now,
		);

		expect(stats.week.recent).toEqual({ seconds: 2 * 3600, people: 1 });
		expect(stats.week.previous).toEqual({ seconds: 3600, people: 1 });
	});

	it("오늘은 최근 7일에 넣지 않는다 — 아직 안 끝났다", () => {
		const stats = buildStats(
			[person("A", ["2026-09-10T09:00:00", "2026-09-10T11:00:00"])],
			kst("2026-08-27T00:00:00"),
			kst("2026-09-11T00:00:00"),
			now,
		);

		expect(stats.week.recent.seconds).toBe(0);
	});
});
