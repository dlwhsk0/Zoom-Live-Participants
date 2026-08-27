import { describe, expect, it } from "vitest";

import { formatAgo, formatElapsed } from "../src/format.ts";

const NOW = Date.parse("2026-08-28T12:00:00Z");

function ago(seconds: number): string {
	return new Date(NOW - seconds * 1000).toISOString();
}

describe("formatElapsed", () => {
	it("1분 미만은 '방금'", () => {
		expect(formatElapsed(ago(0), NOW)).toBe("방금");
		expect(formatElapsed(ago(59), NOW)).toBe("방금");
	});

	it("1시간 미만은 분 단위", () => {
		expect(formatElapsed(ago(60), NOW)).toBe("1분");
		expect(formatElapsed(ago(4 * 60), NOW)).toBe("4분");
	});

	it("1시간 이상은 시간과 분", () => {
		expect(formatElapsed(ago(72 * 60), NOW)).toBe("1시간 12분");
		expect(formatElapsed(ago(120 * 60), NOW)).toBe("2시간");
	});

	it("값이 없거나 이상하면 빈 문자열", () => {
		expect(formatElapsed(null, NOW)).toBe("");
		expect(formatElapsed("not-a-date", NOW)).toBe("");
	});

	it("미래 시각이어도 음수를 만들지 않는다 — 서버/기기 시계 차이", () => {
		expect(formatElapsed(ago(-30), NOW)).toBe("방금");
	});
});

describe("formatAgo", () => {
	it("갱신 시각이 없으면 대시", () => {
		expect(formatAgo(null, NOW)).toBe("—");
	});

	it("5초 미만은 '방금 기준'", () => {
		expect(formatAgo(NOW - 2000, NOW)).toBe("방금 기준");
	});

	it("분 단위로 넘어간다", () => {
		expect(formatAgo(NOW - 30_000, NOW)).toBe("30초 전 기준");
		expect(formatAgo(NOW - 5 * 60_000, NOW)).toBe("5분 전 기준");
		expect(formatAgo(NOW - 2 * 3_600_000, NOW)).toBe("2시간 전 기준");
	});
});
