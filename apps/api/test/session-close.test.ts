import { describe, expect, it } from "vitest";

import { closeOpenForTest } from "../src/repository/stats.ts";

const START = new Date("2026-09-04T02:40:00Z");

describe("퇴장을 못 받은 구간 끊기", () => {
	it("회의가 끝난 시각에서 끊는다", () => {
		const ended = new Date("2026-09-04T05:00:00Z");
		expect(
			closeOpenForTest(START, { endedAt: ended, lastEventAt: ended }),
		).toEqual(ended);
	});

	it("종료를 못 받았고 오래됐으면 마지막 이벤트에서 끊는다", () => {
		const last = new Date("2026-09-04T05:00:00Z");
		expect(
			closeOpenForTest(START, { endedAt: null, lastEventAt: last }),
		).toEqual(last);
	});

	it("종료를 못 받았지만 방금까지 이벤트가 있었으면 열어 둔다", () => {
		// 진행 중인 회의다. 정말로 접속해 있는 것이다.
		const justNow = new Date(Date.now() - 60 * 1000);
		expect(
			closeOpenForTest(START, { endedAt: null, lastEventAt: justNow }),
		).toBeNull();
	});

	it("끝난 뒤에 들어온 입장은 길이 0 으로 닫는다", () => {
		// 실제로 본 것: 회의 종료 02:30, 그 뒤 02:40 에 도착한 입장.
		// 열어 두면 "아직 접속 중" 이 되어 지금까지가 전부 더해진다.
		const before = new Date("2026-09-04T02:30:00Z");
		expect(
			closeOpenForTest(START, { endedAt: before, lastEventAt: before }),
		).toEqual(START);
	});

	it("종료가 있으면 최근이어도 진행 중으로 보지 않는다", () => {
		const justNow = new Date(Date.now() - 60 * 1000);
		expect(
			closeOpenForTest(START, { endedAt: justNow, lastEventAt: justNow }),
		).toEqual(justNow);
	});

	it("어떤 경우에도 지금까지로 늘어나지 않는다", () => {
		// 세션 정보가 있으면 반드시 닫힌다. null 은 진행 중일 때뿐이다.
		const old = new Date("2026-09-04T05:00:00Z");
		for (const session of [
			{ endedAt: old, lastEventAt: old },
			{ endedAt: null, lastEventAt: old },
			{ endedAt: new Date("2026-09-04T01:00:00Z"), lastEventAt: old },
		]) {
			expect(closeOpenForTest(START, session)).not.toBeNull();
		}
	});

	it("세션 정보가 없으면 열어 둔다", () => {
		expect(closeOpenForTest(START, undefined)).toBeNull();
	});
});
