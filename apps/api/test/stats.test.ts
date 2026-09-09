import { describe, expect, it } from "vitest";

import {
	buildStats,
	kstDate,
	kstHour,
	kstWeekday,
	peakConcurrent,
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
		expect(stats.people[0]).toEqual({ displayName: "김하나", seconds: 3 * 3600, days: 1 });
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
			date: "2026-09-08", people: 0, seconds: 0, peak: 0,
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

	it("기록이 없어도 형태는 유지한다", () => {
		const stats = buildStats([], from, to, NOW);

		expect(stats.hours).toHaveLength(24);
		expect(stats.weekdays).toHaveLength(7);
		expect(stats.people).toEqual([]);
		expect(stats.totalSeconds).toBe(0);
	});
});
