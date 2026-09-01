import { describe, expect, it } from "vitest";

import type { ParticipantState } from "../src/domain/presence.ts";
import { resolveSessionStart } from "../src/repository/query.ts";
import {
	parseWebhookBody,
	toParticipantEvent,
} from "../src/webhook/normalize.ts";

import { loadFixtureEvents, loadRawZoomBodies } from "./fixture.ts";

const START = new Date("2026-08-30T07:23:10Z");

function state(overrides: Partial<ParticipantState>): ParticipantState {
	return {
		meetingId: "m1",
		meetingUuid: "s1",
		meetingStartedAt: null,
		participantUuid: "p1",
		displayName: "조하나",
		publicIp: null,
		statusMessage: null,
		statusUpdatedAt: null,
		joinTimeUncertain: false,
		intervals: [],
		isPresent: false,
		lastEventType: "left",
		lastOccurredAt: new Date("2026-08-30T16:00:00Z"),
		firstJoinedAt: null,
		...overrides,
	};
}

describe("start_time 파싱", () => {
	it("웹훅 payload 의 object.start_time 을 읽는다", () => {
		const raw = loadRawZoomBodies()[0];
		const event = toParticipantEvent(parseWebhookBody(raw));
		expect(event?.meetingStartedAt).toBeInstanceOf(Date);
	});

	it("start_time 이 없으면 null 이다. 없어도 되는 값이다", () => {
		const event = toParticipantEvent(
			parseWebhookBody({
				event: "meeting.participant_joined",
				payload: {
					object: {
						id: "1",
						uuid: "s1",
						participant: {
							participant_uuid: "p1",
							join_time: "2026-08-30T09:00:00Z",
						},
					},
				},
			}),
		);
		expect(event).not.toBeNull();
		expect(event?.meetingStartedAt).toBeNull();
	});

	it("start_time 이 날짜가 아니면 null 이다", () => {
		const event = toParticipantEvent(
			parseWebhookBody({
				event: "meeting.participant_joined",
				payload: {
					object: {
						id: "1",
						uuid: "s1",
						start_time: "말도 안 되는 값",
						participant: {
							participant_uuid: "p1",
							join_time: "2026-08-30T09:00:00Z",
						},
					},
				},
			}),
		);
		expect(event?.meetingStartedAt).toBeNull();
	});
});

describe("start_time 은 세션 상수다", () => {
	// 어느 행에서 읽어도 같은 값이라는 것이 이 설계의 전제다.
	// 전제가 깨지면 화면에 보이는 시작 시각이 참가자마다 달라진다.
	it("한 세션 안의 모든 이벤트가 같은 값을 갖는다", () => {
		const bySession = new Map<string, Set<number | null>>();

		for (const event of loadFixtureEvents()) {
			const seen = bySession.get(event.meetingUuid) ?? new Set();
			seen.add(event.meetingStartedAt?.getTime() ?? null);
			bySession.set(event.meetingUuid, seen);
		}

		expect(bySession.size).toBe(4);
		for (const [uuid, values] of bySession) {
			expect(`${uuid}: ${values.size}개`).toBe(`${uuid}: 1개`);
		}
	});

	it("세션마다 값이 다르다", () => {
		const values = new Set(
			loadFixtureEvents().map((e) => e.meetingStartedAt?.getTime()),
		);
		expect(values.size).toBe(4);
	});
});

describe("resolveSessionStart", () => {
	it("start_time 이 있으면 그대로 쓰고 추정이 아니다", () => {
		const result = resolveSessionStart(
			[state({ meetingStartedAt: START })],
			[{ firstJoinedAt: null, lastOccurredAt: new Date() }],
		);
		expect(result.startedAt).toEqual(START);
		expect(result.startedAtEstimated).toBe(false);
	});

	it("일부 행에만 있어도 찾아낸다", () => {
		const result = resolveSessionStart(
			[state({}), state({ meetingStartedAt: START }), state({})],
			[{ firstJoinedAt: null, lastOccurredAt: new Date() }],
		);
		expect(result.startedAt).toEqual(START);
		expect(result.startedAtEstimated).toBe(false);
	});

	it("start_time 이 없으면 가장 이른 기록 시각으로 물러서고 추정으로 표시한다", () => {
		const early = new Date("2026-08-30T16:00:00Z");
		const late = new Date("2026-08-30T18:00:00Z");
		const result = resolveSessionStart(
			[state({})],
			[
				{ firstJoinedAt: late, lastOccurredAt: late },
				{ firstJoinedAt: early, lastOccurredAt: late },
			],
		);
		expect(result.startedAt).toEqual(early);
		expect(result.startedAtEstimated).toBe(true);
	});

	it("입장 시각을 놓친 사람은 마지막 이벤트 시각으로 대신한다", () => {
		const seen = new Date("2026-08-30T16:00:00Z");
		const result = resolveSessionStart(
			[state({})],
			[{ firstJoinedAt: null, lastOccurredAt: seen }],
		);
		expect(result.startedAt).toEqual(seen);
		expect(result.startedAtEstimated).toBe(true);
	});

	it("아무도 없으면 null 이고 추정도 아니다", () => {
		const result = resolveSessionStart([], []);
		expect(result.startedAt).toBeNull();
		expect(result.startedAtEstimated).toBe(false);
	});
});
