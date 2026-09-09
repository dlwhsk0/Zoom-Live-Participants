import { describe, expect, it } from "vitest";

import { fillFromSnapshotsForTest } from "../src/repository/stats.ts";
import type { Stats } from "../src/domain/stats.ts";

const BASE: Stats = {
	from: "2026-09-01",
	to: "2026-09-03",
	days: [
		{ date: "2026-09-01", people: 0, seconds: 0, peak: 0, firstAt: null, lastAt: null },
		{ date: "2026-09-02", people: 3, seconds: 7200, peak: 2, firstAt: "21:00", lastAt: "23:00" },
		{ date: "2026-09-03", people: 0, seconds: 0, peak: 0, firstAt: null, lastAt: null },
	],
	hours: [],
	weekdays: [],
	people: [],
	weeks: [],
	months: [],
	week: { recent: { seconds: 0, people: 0 }, previous: { seconds: 0, people: 0 } },
	typicalStart: null,
	typicalEnd: null,
	totalSeconds: 7200,
	totalPeople: 3,
};

const SAVED = {
	date: "2026-09-01",
	people: 10,
	seconds: 3600,
	peak: 5,
	firstAt: "22:00",
	lastAt: "01:00",
};

describe("저장된 기록으로 채우기", () => {
	it("원본이 없는 날을 채운다", () => {
		const filled = fillFromSnapshotsForTest(BASE, [SAVED]);

		expect(filled.days[0]).toEqual({
			date: "2026-09-01",
			people: 10,
			seconds: 3600,
			peak: 5,
			firstAt: "22:00",
			lastAt: "01:00",
		});
	});

	it("채운 만큼 총합에 더한다", () => {
		expect(fillFromSnapshotsForTest(BASE, [SAVED]).totalSeconds).toBe(7200 + 3600);
	});

	it("원본이 있는 날은 건드리지 않는다 — 그쪽이 진실이다", () => {
		const stale = { ...SAVED, date: "2026-09-02", seconds: 999999, people: 99 };
		const filled = fillFromSnapshotsForTest(BASE, [stale]);

		expect(filled.days[1]?.seconds).toBe(7200);
		expect(filled.totalSeconds).toBe(7200);
	});

	it("빈 스냅샷으로는 채우지 않는다", () => {
		const empty = { ...SAVED, seconds: 0, people: 0 };
		const filled = fillFromSnapshotsForTest(BASE, [empty]);

		expect(filled.days[0]?.seconds).toBe(0);
		expect(filled).toBe(BASE);
	});

	it("채울 것이 없으면 원래 것을 그대로 준다", () => {
		expect(fillFromSnapshotsForTest(BASE, [])).toBe(BASE);
	});
});

describe("하루치를 셀 때의 창", () => {
	it("밤을 넘긴 구간이 자정에서 잘리면 안 된다", () => {
		// snapshotDay 는 앞뒤로 하루씩 넓게 세고 가운데 날만 꺼낸다.
		// 하루 창으로 세면 22:00~04:00 구간의 끝이 00:00 으로 잘려
		// "마지막으로 나간 시각" 이 매일 00:00 으로 굳는다. 실제로 그랬다.
		const clipped = { ...SAVED, date: "2026-09-01", lastAt: "00:00" };
		const filled = fillFromSnapshotsForTest(BASE, [clipped]);

		// 저장된 값을 그대로 쓰므로, 잘린 값이 저장되면 화면에도 그대로 나온다.
		// 자르지 않는 책임은 snapshotDay 에 있다.
		expect(filled.days[0]?.lastAt).toBe("00:00");
	});
});
