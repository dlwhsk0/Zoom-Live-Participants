import { afterEach, describe, expect, it, vi } from "vitest";

import type { getDb } from "../src/db/client.ts";
import {
	enableSessionBackfill,
	scheduleSessionBackfill,
	SESSION_BACKFILL_DELAYS_MS,
} from "../src/jobs/backfill.ts";
import type { ZoomReportClient } from "../src/zoom/report-api.ts";

const SESSION = {
	meetingId: "83877926942",
	meetingUuid: "S1==",
	startTime: new Date("2026-10-22T08:14:07Z"),
};

afterEach(() => {
	vi.useRealTimers();
});

describe("회의가 끝나면 메꾸기", () => {
	it("켜지 않았으면 아무것도 예약하지 않는다", () => {
		vi.useFakeTimers();
		scheduleSessionBackfill(SESSION);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("끝난 직후가 아니라 몇 분 뒤부터 여러 번 Report API 를 부른다", async () => {
		vi.useFakeTimers();
		const calls: string[] = [];
		const zoom: ZoomReportClient = {
			listPastInstances: async () => [],
			// 빈 목록이면 DB 를 건드리지 않고 끝난다
			listReportParticipants: async (uuid) => {
				calls.push(uuid);
				return [];
			},
		};
		enableSessionBackfill({} as ReturnType<typeof getDb>, zoom);

		scheduleSessionBackfill(SESSION);
		expect(calls).toEqual([]);

		await vi.advanceTimersByTimeAsync(SESSION_BACKFILL_DELAYS_MS[0] as number);
		expect(calls).toEqual(["S1=="]);

		await vi.advanceTimersByTimeAsync(
			Math.max(...SESSION_BACKFILL_DELAYS_MS),
		);
		expect(calls).toHaveLength(SESSION_BACKFILL_DELAYS_MS.length);
	});
});
