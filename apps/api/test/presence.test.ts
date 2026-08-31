import { describe, expect, it } from "vitest";

import {
	applyMeetingEnded,
	latestMeetingUuid,
	listPresent,
	type ParticipantEvent,
	participantKey,
	reducePresence,
	shouldAdvance,
} from "../src/domain/presence.ts";
import {
	inOccurrenceOrder,
	loadFixtureEvents,
	loadFixtureRows,
	shuffle,
} from "./fixture.ts";

const events = loadFixtureEvents();
const ordered = inOccurrenceOrder(events);

/** 정렬순으로 재생했을 때의 접속자 집합. 다른 순서와 비교할 기준값. */
function presentKeys(input: readonly ParticipantEvent[]): string {
	const states = reducePresence(input);
	return listPresent(states)
		.map((s) => participantKey(s.meetingUuid, s.participantUuid))
		.sort()
		.join(",");
}

const BASELINE = presentKeys(ordered);

describe("fixture", () => {
	it("참가자 이벤트 157건을 담고 있다", () => {
		expect(events).toHaveLength(157);
	});

	it("모든 이벤트에 meeting_id 와 participant_uuid 가 있다", () => {
		for (const event of events) {
			expect(event.meetingId).not.toBe("");
			expect(event.participantUuid).not.toBe("");
		}
	});
});

describe("shouldAdvance", () => {
	const base: ParticipantEvent = {
		meetingId: "m1",
		meetingUuid: "s1",
		meetingStartedAt: null,
		participantUuid: "p1",
		eventType: "left",
		occurredAt: new Date("2026-01-01T00:00:00Z"),
		displayName: null,
		userId: null,
		publicIp: null,
		leaveReason: null,
	};

	it("기존 상태가 없으면 반영한다", () => {
		expect(shouldAdvance(undefined, base)).toBe(true);
	});

	it("더 늦은 이벤트는 반영한다", () => {
		const states = reducePresence([base]);
		const later = { ...base, occurredAt: new Date("2026-01-01T00:00:01Z") };
		expect(shouldAdvance(states.get("s1|p1"), later)).toBe(true);
	});

	it("더 이른 이벤트는 무시한다 — 늦게 도착한 과거 웹훅", () => {
		const states = reducePresence([base]);
		const earlier = { ...base, occurredAt: new Date("2025-12-31T23:59:59Z") };
		expect(shouldAdvance(states.get("s1|p1"), earlier)).toBe(false);
	});

	it("동일 시각이면 joined 가 left 를 이긴다 — 방 이동", () => {
		const states = reducePresence([base]);
		const sameTimeJoin = { ...base, eventType: "joined" as const };
		expect(shouldAdvance(states.get("s1|p1"), sameTimeJoin)).toBe(true);
	});

	it("동일 시각에 left 가 뒤늦게 와도 joined 를 덮지 못한다", () => {
		const join = { ...base, eventType: "joined" as const };
		const states = reducePresence([join]);
		expect(shouldAdvance(states.get("s1|p1"), base)).toBe(false);
	});
});

describe("순서와 중복에 무관해야 한다", () => {
	it("무작위 셔플 200회 결과가 모두 같다", () => {
		for (let seed = 1; seed <= 200; seed++) {
			expect(presentKeys(shuffle(events, seed))).toBe(BASELINE);
		}
	});

	it("완전 역순 결과가 같다", () => {
		expect(presentKeys([...ordered].reverse())).toBe(BASELINE);
	});

	it("전체를 3배로 중복시켜도 결과가 같다", () => {
		expect(presentKeys([...ordered, ...ordered, ...ordered])).toBe(BASELINE);
	});

	it("역순과 중복을 섞어도 결과가 같다", () => {
		const mixed = [...ordered, ...shuffle(events, 42), ...ordered].reverse();
		expect(presentKeys(mixed)).toBe(BASELINE);
	});
});

describe("실측 시나리오", () => {
	/** 세션을 타임라인으로 재생하며 동시 접속 최댓값을 구한다. */
	function maxConcurrent(meetingUuid: string): number {
		const states = new Map<string, ReturnType<typeof reducePresence> extends Map<string, infer V> ? V : never>();
		let max = 0;

		for (const event of ordered.filter((e) => e.meetingUuid === meetingUuid)) {
			const key = participantKey(event.meetingUuid, event.participantUuid);
			if (shouldAdvance(states.get(key), event)) {
				states.set(key, {
					meetingId: event.meetingId,
					meetingUuid: event.meetingUuid,
					meetingStartedAt: event.meetingStartedAt,
					participantUuid: event.participantUuid,
					displayName: event.displayName,
					publicIp: event.publicIp,
					statusMessage: null,
					statusUpdatedAt: null,
					joinTimeUncertain: false,
					onlineSeconds: 0,
					isPresent: event.eventType === "joined",
					lastEventType: event.eventType,
					lastOccurredAt: event.occurredAt,
					firstJoinedAt:
						event.eventType === "joined"
							? (states.get(key)?.firstJoinedAt ?? event.occurredAt)
							: (states.get(key)?.firstJoinedAt ?? null),
				});
			}
			max = Math.max(max, listPresent(states).length);
		}

		return max;
	}

	it("가장 큰 세션의 최대 동시 접속은 12명이다 (v1은 4명으로 집계했다)", () => {
		expect(maxConcurrent("TESTUUID0004==")).toBe(12);
	});

	it("모든 세션이 최종 0명으로 수렴한다", () => {
		const states = reducePresence(ordered);
		expect(listPresent(states)).toHaveLength(0);
	});

	it("소회의실 이동은 접속을 끊지 않는다", () => {
		// 동일 발생 시각의 left+joined 쌍을 실제 fixture 에서 찾는다
		const joinAt = new Set(
			events
				.filter((e) => e.eventType === "joined")
				.map((e) => `${e.participantUuid}@${e.occurredAt.getTime()}`),
		);
		const roomMoves = events.filter(
			(e) =>
				e.eventType === "left" &&
				joinAt.has(`${e.participantUuid}@${e.occurredAt.getTime()}`),
		);

		expect(roomMoves.length).toBe(40);

		for (const move of roomMoves) {
			const pair = events.filter(
				(e) =>
					e.participantUuid === move.participantUuid &&
					e.occurredAt.getTime() === move.occurredAt.getTime(),
			);
			// 쌍만 넣었을 때 접속 상태로 남아야 한다
			const states = reducePresence(pair);
			const key = participantKey(move.meetingUuid, move.participantUuid);
			expect(states.get(key)?.isPresent).toBe(true);
		}
	});

	it("leave_reason 만으로는 방 이동의 69%를 놓친다 — v1이 실패한 이유", () => {
		const joinAt = new Set(
			events
				.filter((e) => e.eventType === "joined")
				.map((e) => `${e.participantUuid}@${e.occurredAt.getTime()}`),
		);
		const roomMoves = events.filter(
			(e) =>
				e.eventType === "left" &&
				joinAt.has(`${e.participantUuid}@${e.occurredAt.getTime()}`),
		);
		const caughtByReason = roomMoves.filter((e) =>
			e.leaveReason?.includes("to join breakout room"),
		);

		expect(roomMoves).toHaveLength(40);
		expect(caughtByReason).toHaveLength(12);
	});

	it("퇴장 후 재입장 간격은 0초 아니면 없음이다 — 중간값이 존재하지 않는다", () => {
		const gaps: number[] = [];

		for (const left of events.filter((e) => e.eventType === "left")) {
			const rejoin = events.find(
				(e) =>
					e.eventType === "joined" &&
					e.participantUuid === left.participantUuid &&
					e.occurredAt.getTime() >= left.occurredAt.getTime(),
			);
			if (rejoin) {
				gaps.push(rejoin.occurredAt.getTime() - left.occurredAt.getTime());
			}
		}

		expect(gaps).toHaveLength(40);
		expect(gaps.every((g) => g === 0)).toBe(true);
	});
});

describe("meeting.ended", () => {
	it("세션의 남은 접속자를 정리한다", () => {
		const now = new Date("2026-01-01T00:00:00Z");
		const states = reducePresence([
			{
				meetingId: "m1",
				meetingUuid: "s1",
				meetingStartedAt: null,
				participantUuid: "p1",
				eventType: "joined",
				occurredAt: now,
				displayName: "테스터",
				userId: null,
				publicIp: null,
				leaveReason: null,
			},
		]);

		expect(listPresent(states)).toHaveLength(1);
		applyMeetingEnded(states, "s1");
		expect(listPresent(states)).toHaveLength(0);
	});
});

describe("latestMeetingUuid", () => {
	it("회의방의 가장 최근 세션을 고른다", () => {
		const states = reducePresence(ordered);
		const rows = loadFixtureRows();
		const meetingId = rows.find((r) => r.meeting_id)?.meeting_id ?? "";

		// fixture 의 회의방은 하나이고 세션은 4개다
		const sessions = new Set(events.map((e) => e.meetingUuid));
		expect(sessions.size).toBe(4);

		const latest = latestMeetingUuid(states, meetingId);
		const maxOccurred = Math.max(...events.map((e) => e.occurredAt.getTime()));
		const expected = events.find(
			(e) => e.occurredAt.getTime() === maxOccurred,
		)?.meetingUuid;

		expect(latest).toBe(expected);
	});
});
