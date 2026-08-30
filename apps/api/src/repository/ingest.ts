import { and, eq, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import {
	participantEvents,
	participants,
	webhookEvents,
} from "../db/schema.ts";
import type { ParticipantEvent } from "../domain/presence.ts";

type Db = ReturnType<typeof getDb>;

/**
 * 원본 웹훅 저장. 이미 처리한 이벤트면 null 을 반환한다.
 *
 * dedupe_key unique 제약이 중복 수신을 막는다.
 * Zoom 은 응답이 늦으면 재전송하므로 중복은 정상 상황이다.
 */
export async function insertWebhookEvent(
	db: Db,
	payload: unknown,
	dedupeKey: string,
): Promise<string | null> {
	const rows = await db
		.insert(webhookEvents)
		.values({ payload, dedupeKey })
		.onConflictDoNothing({ target: webhookEvents.dedupeKey })
		.returning({ id: webhookEvents.id });

	return rows[0]?.id ?? null;
}

export async function insertParticipantEvent(
	db: Db,
	webhookEventId: string,
	event: ParticipantEvent,
): Promise<void> {
	await db.insert(participantEvents).values({
		webhookEventId,
		meetingId: event.meetingId,
		meetingUuid: event.meetingUuid,
		participantUuid: event.participantUuid,
		eventType: event.eventType,
		occurredAt: event.occurredAt,
		displayName: event.displayName,
		userId: event.userId,
		publicIp: event.publicIp,
		leaveReason: event.leaveReason,
	});
}

/**
 * 사용자 목록 갱신.
 *
 * WHERE 조건이 판정 규칙 그 자체다.
 * 더 늦은 이벤트이거나, 같은 시각이면 joined 인 경우에만 진행한다.
 * 이 조건 덕분에 도착 순서가 뒤바뀌거나 중복 수신되어도 결과가 같다.
 */
export async function upsertParticipant(
	db: Db,
	event: ParticipantEvent,
): Promise<void> {
	const isPresent = event.eventType === "joined";
	const firstJoinedAt = isPresent ? event.occurredAt : null;

	await db
		.insert(participants)
		.values({
			meetingId: event.meetingId,
			meetingUuid: event.meetingUuid,
			participantUuid: event.participantUuid,
			displayName: event.displayName,
			publicIp: event.publicIp,
			isPresent,
			lastEventType: event.eventType,
			lastOccurredAt: event.occurredAt,
			firstJoinedAt,
		})
		.onConflictDoUpdate({
			target: [participants.meetingUuid, participants.participantUuid],
			set: {
				displayName: sql`excluded.display_name`,
				publicIp: sql`excluded.public_ip`,
				isPresent: sql`excluded.is_present`,
				lastEventType: sql`excluded.last_event_type`,
				lastOccurredAt: sql`excluded.last_occurred_at`,
				// LEAST 는 NULL 을 무시하므로 최초 입장 시각이 보존된다
				firstJoinedAt: sql`least(${participants.firstJoinedAt}, excluded.first_joined_at)`,
				updatedAt: sql`now()`,
			},
			setWhere: sql`
				excluded.last_occurred_at > ${participants.lastOccurredAt}
				or (
					excluded.last_occurred_at = ${participants.lastOccurredAt}
					and excluded.last_event_type = 'joined'
				)
			`,
		});
}

/**
 * meeting.ended 반영.
 *
 * left 웹훅이 누락되어 남아 있는 유령 접속자를 정리한다.
 */
export async function markSessionEnded(
	db: Db,
	meetingUuid: string,
): Promise<number> {
	const rows = await db
		.update(participants)
		.set({ isPresent: false, lastEventType: "left", updatedAt: new Date() })
		.where(
			and(
				eq(participants.meetingUuid, meetingUuid),
				eq(participants.isPresent, true),
			),
		)
		.returning({ id: participants.id });

	return rows.length;
}

/**
 * 상태 메시지 저장.
 *
 * 권한을 두지 않는다. 누구나 누구의 것이든 바꿀 수 있다.
 * 화면에서 수정 전에 한 번 확인만 받는다.
 *
 * 재접속하면 새 행이 생기지만, 조회 시 합칠 때
 * statusUpdatedAt 이 가장 최근인 값을 골라 이어진다.
 */
export async function setStatusMessage(
	db: Db,
	meetingUuid: string,
	participantUuid: string,
	message: string | null,
): Promise<boolean> {
	const rows = await db
		.update(participants)
		.set({
			statusMessage: message,
			statusUpdatedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(participants.meetingUuid, meetingUuid),
				eq(participants.participantUuid, participantUuid),
			),
		)
		.returning({ id: participants.id });

	return rows.length > 0;
}

/**
 * 같은 참가자·같은 발생 시각에 특정 종류의 이벤트가 이미 있는지.
 *
 * 소회의실 이동 판정(동일 시각의 left + joined 쌍)을 세는 데 쓴다.
 */
export async function hasOppositeEventAt(
	db: Db,
	meetingUuid: string,
	participantUuid: string,
	occurredAt: Date,
	eventType: "joined" | "left",
): Promise<boolean> {
	const rows = await db
		.select({ id: participantEvents.id })
		.from(participantEvents)
		.where(
			and(
				eq(participantEvents.meetingUuid, meetingUuid),
				eq(participantEvents.participantUuid, participantUuid),
				eq(participantEvents.occurredAt, occurredAt),
				eq(participantEvents.eventType, eventType),
			),
		)
		.limit(1);

	return rows.length > 0;
}
