import { describe, expect, it } from "vitest";

import {
	formatAgo,
	formatDuration,
	formatElapsed,
	formatSessionStart,
	restTier,
	studyTier,
	totalOnlineSeconds,
} from "../src/format.ts";

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

describe("formatSessionStart", () => {
	it("날짜와 요일, 시각을 함께 보여준다", () => {
		// 테스트는 TZ=Asia/Seoul 로 돈다. 07:23 UTC = 16:23 KST.
		expect(formatSessionStart("2026-08-30T07:23:10Z")).toBe(
			"8월 30일 (일) 오후 4:23",
		);
	});

	it("값이 없으면 빈 문자열이다", () => {
		expect(formatSessionStart(null)).toBe("");
	});

	it("날짜가 아니면 빈 문자열이다", () => {
		expect(formatSessionStart("말도 안 되는 값")).toBe("");
	});
});

describe("totalOnlineSeconds", () => {
	const at = (secondsAgo: number) =>
		new Date(NOW - secondsAgo * 1000).toISOString();

	it("나간 사람은 서버 값을 그대로 쓴다", () => {
		expect(
			totalOnlineSeconds(
				{ onlineSeconds: 600, isPresent: false, lastOccurredAt: at(300) },
				NOW,
			),
		).toBe(600);
	});

	it("접속 중이면 진행 중인 구간을 더한다", () => {
		expect(
			totalOnlineSeconds(
				{ onlineSeconds: 600, isPresent: true, lastOccurredAt: at(120) },
				NOW,
			),
		).toBe(720);
	});

	it("시각이 미래여도 시간이 줄지 않는다", () => {
		expect(
			totalOnlineSeconds(
				{ onlineSeconds: 600, isPresent: true, lastOccurredAt: at(-60) },
				NOW,
			),
		).toBe(600);
	});
});

describe("formatDuration", () => {
	it("한 시간 미만은 분만 보여준다", () => {
		expect(formatDuration(23 * 60)).toBe("23분");
		expect(formatDuration(0)).toBe("0분");
	});

	it("한 시간을 넘기면 분을 두 자리로 맞춘다", () => {
		expect(formatDuration(3600)).toBe("1시간 00분");
		expect(formatDuration(4 * 3600 + 6 * 60)).toBe("4시간 06분");
	});

	it("음수는 0분이다", () => {
		expect(formatDuration(-100)).toBe("0분");
	});
});

describe("studyTier", () => {
	it("경계값에서 단계가 오른다", () => {
		expect(studyTier(0)).toBe(0);
		expect(studyTier(30 * 60 - 1)).toBe(0);
		expect(studyTier(30 * 60)).toBe(1);
		expect(studyTier(3600 - 1)).toBe(1);
		expect(studyTier(3600)).toBe(2);
		expect(studyTier(3 * 3600 - 1)).toBe(2);
		expect(studyTier(3 * 3600)).toBe(3);
		expect(studyTier(5 * 3600 - 1)).toBe(3);
		expect(studyTier(5 * 3600)).toBe(4);
	});

	it("불은 1시간부터 붙는다", () => {
		// 1단계는 아직 불이 아니다. 화면에서 불꽃은 2단계부터 그린다.
		expect(studyTier(59 * 60)).toBeLessThan(2);
		expect(studyTier(60 * 60)).toBe(2);
	});
});

describe("restTier", () => {
	const at = (minutesAgo: number) =>
		new Date(NOW - minutesAgo * 60_000).toISOString();

	it("나간 지 오래될수록 깊이 잠든다", () => {
		expect(restTier(at(0), NOW)).toBe(0);
		expect(restTier(at(59), NOW)).toBe(0);
		expect(restTier(at(60), NOW)).toBe(1);
		expect(restTier(at(179), NOW)).toBe(1);
		expect(restTier(at(180), NOW)).toBe(2);
		expect(restTier(at(299), NOW)).toBe(2);
		expect(restTier(at(300), NOW)).toBe(3);
	});

	it("접속 쪽과 같은 눈금(1·3·5시간)을 쓴다", () => {
		expect(restTier(at(60), NOW)).toBe(1);
		expect(restTier(at(180), NOW)).toBe(2);
		expect(restTier(at(300), NOW)).toBe(3);
	});

	it("시각을 모르면 가장 깊은 단계로 둔다", () => {
		expect(restTier(null, NOW)).toBe(3);
		expect(restTier("말도 안 되는 값", NOW)).toBe(3);
	});
});
