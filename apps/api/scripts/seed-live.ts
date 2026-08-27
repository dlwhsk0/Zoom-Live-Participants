/**
 * 데모용 시드. fixture 를 "12명이 접속 중"인 시점까지만 재생한다.
 *
 * 조회 API 와 화면을 실제 데이터로 확인하기 위한 것이다.
 * 접속 시각은 현재 시각 기준으로 당겨서 경과 시간이 자연스럽게 보이게 한다.
 */
import { readFileSync } from "node:fs";

import { getEnv } from "../src/config/env.ts";
import { closeDb, getDb } from "../src/db/client.ts";
import { participantEvents, participants, webhookEvents } from "../src/db/schema.ts";
import { participantKey, shouldAdvance } from "../src/domain/presence.ts";
import type { ParticipantEvent, ParticipantState } from "../src/domain/presence.ts";

const FIXTURE = new URL("../test/fixtures/webhook-events.ndjson", import.meta.url);
const TARGET_SESSION = "TESTUUID0004==";

/**
 * fixture 의 회의방 번호는 익명화된 더미다.
 * 조회 API 는 ZOOM_MEETING_ID 로 세션을 찾으므로, 시드도 그 값에 맞춘다.
 */
const MEETING_ID = getEnv().ZOOM_MEETING_ID ?? "10000000001";

const rows = readFileSync(FIXTURE, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((l) => JSON.parse(l) as { event: string; meeting_id?: string; meeting_uuid?: string; participant?: Record<string, string> });

const events: ParticipantEvent[] = rows
	.filter(
		(r) =>
			r.meeting_uuid === TARGET_SESSION &&
			r.event.startsWith("meeting.participant_"),
	)
	.map((r) => {
		const isJoin = r.event === "meeting.participant_joined";
		return {
			meetingId: MEETING_ID,
			meetingUuid: r.meeting_uuid ?? "",
			participantUuid: r.participant?.participant_uuid ?? "",
			eventType: isJoin ? ("joined" as const) : ("left" as const),
			occurredAt: new Date(
				(isJoin ? r.participant?.join_time : r.participant?.leave_time) ?? 0,
			),
			displayName: r.participant?.user_name ?? null,
			userId: r.participant?.user_id ?? null,
			leaveReason: r.participant?.leave_reason ?? null,
		};
	})
	.sort(
		(a, b) =>
			a.occurredAt.getTime() - b.occurredAt.getTime() ||
			(a.eventType === "joined" ? -1 : 1),
	);

// 동시 접속이 12명이 되는 지점까지 자른다
const states = new Map<string, ParticipantState>();
let cutoff = events.length;
for (const [index, event] of events.entries()) {
	const key = participantKey(event.meetingUuid, event.participantUuid);
	const current = states.get(key);
	if (shouldAdvance(current, event)) {
		states.set(key, {
			...event,
			isPresent: event.eventType === "joined",
			lastEventType: event.eventType,
			lastOccurredAt: event.occurredAt,
			firstJoinedAt:
				event.eventType === "joined"
					? (current?.firstJoinedAt ?? event.occurredAt)
					: (current?.firstJoinedAt ?? null),
		});
	}
	if ([...states.values()].filter((s) => s.isPresent).length >= 12) {
		cutoff = index + 1;
		break;
	}
}

const kept = events.slice(0, cutoff);
// 마지막 이벤트가 "지금"이 되도록 전체를 평행 이동한다
const shift = Date.now() - (kept.at(-1)?.occurredAt.getTime() ?? Date.now());
const shifted = kept.map((e) => ({
	...e,
	occurredAt: new Date(e.occurredAt.getTime() + shift),
}));

const db = getDb();
await db.delete(participants);
await db.delete(participantEvents);
await db.delete(webhookEvents);

const [raw] = await db
	.insert(webhookEvents)
	.values({ payload: { seed: true }, dedupeKey: `seed|${Date.now()}` })
	.returning({ id: webhookEvents.id });

for (const event of shifted) {
	await db.insert(participantEvents).values({
		webhookEventId: raw!.id,
		meetingId: event.meetingId,
		meetingUuid: event.meetingUuid,
		participantUuid: event.participantUuid,
		eventType: event.eventType,
		occurredAt: event.occurredAt,
		displayName: event.displayName,
		userId: event.userId,
		leaveReason: event.leaveReason,
	});
}

// 최종 상태만 participants 에 반영
const final = new Map<string, ParticipantState>();
for (const event of shifted) {
	const key = participantKey(event.meetingUuid, event.participantUuid);
	const current = final.get(key);
	if (shouldAdvance(current, event)) {
		final.set(key, {
			...event,
			isPresent: event.eventType === "joined",
			lastEventType: event.eventType,
			lastOccurredAt: event.occurredAt,
			firstJoinedAt:
				event.eventType === "joined"
					? (current?.firstJoinedAt ?? event.occurredAt)
					: (current?.firstJoinedAt ?? null),
		});
	}
}

for (const state of final.values()) {
	await db.insert(participants).values({
		meetingId: state.meetingId,
		meetingUuid: state.meetingUuid,
		participantUuid: state.participantUuid,
		displayName: state.displayName,
		isPresent: state.isPresent,
		lastEventType: state.lastEventType,
		lastOccurredAt: state.lastOccurredAt,
		firstJoinedAt: state.firstJoinedAt,
	});
}

const present = [...final.values()].filter((s) => s.isPresent);
console.log(`이벤트 ${shifted.length}건 시드 완료 / 접속 중 ${present.length}명 (meeting_id=${MEETING_ID})`);
for (const p of present) {
	console.log(`  ${p.displayName}`);
}

await closeDb();
