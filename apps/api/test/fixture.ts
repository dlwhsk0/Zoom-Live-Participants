import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ParticipantEvent } from "../src/domain/presence.ts";

const FIXTURE_PATH = fileURLToPath(
	new URL("./fixtures/webhook-events.ndjson", import.meta.url),
);

interface RawFixtureRow {
	event: string;
	/** Zoom 이 실제로 보낸 원본 body. 웹훅 핸들러가 받는 것과 같은 형태다. */
	raw?: unknown;
	meeting_id?: string;
	meeting_uuid?: string;
	participant?: {
		participant_uuid?: string;
		user_id?: string;
		user_name?: string;
		join_time?: string;
		leave_time?: string;
		leave_reason?: string;
	};
}

export function loadFixtureRows(): RawFixtureRow[] {
	return readFileSync(FIXTURE_PATH, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as RawFixtureRow);
}

/**
 * Zoom 원본 body 목록.
 *
 * fixture 의 각 행은 v1 이 정규화한 형태이고,
 * Zoom 이 실제로 보낸 body 는 raw 필드에 그대로 들어 있다.
 * 웹훅 핸들러 테스트는 이쪽을 써야 한다.
 */
export function loadRawZoomBodies(): unknown[] {
	return loadFixtureRows()
		.map((row) => row.raw)
		.filter((raw): raw is unknown => raw !== undefined);
}

/** fixture 의 참가자 입퇴장 이벤트를 도메인 타입으로 변환한다. */
export function loadFixtureEvents(): ParticipantEvent[] {
	const events: ParticipantEvent[] = [];

	for (const row of loadFixtureRows()) {
		const isJoin = row.event === "meeting.participant_joined";
		const isLeft = row.event === "meeting.participant_left";
		if (!isJoin && !isLeft) continue;

		const occurredRaw = isJoin
			? row.participant?.join_time
			: row.participant?.leave_time;

		if (!occurredRaw || !row.meeting_uuid || !row.participant?.participant_uuid) {
			continue;
		}

		events.push({
			meetingId: row.meeting_id ?? "",
			meetingUuid: row.meeting_uuid,
			participantUuid: row.participant.participant_uuid,
			eventType: isJoin ? "joined" : "left",
			occurredAt: new Date(occurredRaw),
			displayName: row.participant.user_name ?? null,
			userId: row.participant.user_id ?? null,
			leaveReason: row.participant.leave_reason ?? null,
		});
	}

	return events;
}

/** 발생 시각 오름차순. 동일 시각이면 joined 를 먼저 둔다. */
export function inOccurrenceOrder(
	events: readonly ParticipantEvent[],
): ParticipantEvent[] {
	return [...events].sort((a, b) => {
		const diff = a.occurredAt.getTime() - b.occurredAt.getTime();
		if (diff !== 0) return diff;
		return a.eventType === "joined" ? -1 : 1;
	});
}

/** 시드 기반 셔플. 테스트가 재현 가능해야 하므로 Math.random 을 쓰지 않는다. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
	const out = [...items];
	let state = seed;

	for (let i = out.length - 1; i > 0; i--) {
		state = (state * 1664525 + 1013904223) % 4294967296;
		const j = state % (i + 1);
		const a = out[i] as T;
		const b = out[j] as T;
		out[i] = b;
		out[j] = a;
	}

	return out;
}
