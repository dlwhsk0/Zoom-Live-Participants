import { and, asc, eq, gte, lte } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { participantEvents, webhookEvents } from "../db/schema.ts";
import type { KnownEvent, PlannedEvent } from "../domain/backfill.ts";
import type { EventType } from "../domain/presence.ts";
import { buildDedupeKey } from "../webhook/normalize.ts";
import {
	insertParticipantEvent,
	insertWebhookEvent,
	upsertParticipant,
} from "./ingest.ts";

type Db = ReturnType<typeof getDb>;

/** 이 세션에서 이미 받은 입퇴장. */
export async function findSessionEvents(
	db: Db,
	meetingUuid: string,
): Promise<KnownEvent[]> {
	const rows = await db
		.select({
			participantUuid: participantEvents.participantUuid,
			eventType: participantEvents.eventType,
			occurredAt: participantEvents.occurredAt,
			userId: participantEvents.userId,
			displayName: participantEvents.displayName,
		})
		.from(participantEvents)
		.where(eq(participantEvents.meetingUuid, meetingUuid));

	return rows.map((row) => ({ ...row, eventType: row.eventType as EventType }));
}

/**
 * 이 구간에 웹훅을 받은 시각들(ms, 오름차순).
 *
 * 회의를 가리지 않는다. 묻는 것은 "그때 서버가 받고 있었나" 다.
 */
export async function findReceivedTimes(
	db: Db,
	from: Date,
	to: Date,
): Promise<number[]> {
	const rows = await db
		.select({ receivedAt: webhookEvents.receivedAt })
		.from(webhookEvents)
		.where(
			and(gte(webhookEvents.receivedAt, from), lte(webhookEvents.receivedAt, to)),
		)
		.orderBy(asc(webhookEvents.receivedAt));

	return rows.map((row) => row.receivedAt.getTime());
}

/**
 * 계획한 이벤트를 웹훅과 같은 길로 넣는다.
 *
 * 원본(webhook_events) → 정규화(participant_events) → 목록(participants).
 * dedupe_key 가 웹훅과 같은 형식이라 두 번 돌려도, 배포 중 컨테이너 둘이
 * 동시에 돌려도 한 번만 들어간다.
 *
 * 원본에는 출처를 남긴다. event 가 `backfill.` 로 시작해 로그 화면에서
 * 웹훅과 갈린다.
 */
export async function applyBackfill(
	db: Db,
	planned: readonly PlannedEvent[],
	source: {
		meetingStartedAt: Date | null;
		records: readonly Record<string, unknown>[];
		now: Date;
	},
): Promise<PlannedEvent[]> {
	const inserted: PlannedEvent[] = [];

	for (const item of planned) {
		const { event } = item;
		const payload = {
			event: `backfill.participant_${event.eventType}`,
			source: "zoom_report_api",
			backfilled_at: source.now.toISOString(),
			anchored: item.anchored,
			payload: {
				object: {
					id: event.meetingId,
					uuid: event.meetingUuid,
					start_time: source.meetingStartedAt?.toISOString(),
					participant: {
						participant_uuid: event.participantUuid,
						user_id: event.userId,
						user_name: event.displayName,
						[event.eventType === "joined" ? "join_time" : "leave_time"]:
							event.occurredAt.toISOString(),
					},
				},
			},
			report: source.records[item.recordIndex] ?? null,
		};

		const webhookEventId = await insertWebhookEvent(
			db,
			payload,
			buildDedupeKey(event),
		);
		if (!webhookEventId) continue;

		await insertParticipantEvent(db, webhookEventId, event);
		await upsertParticipant(db, event);
		inserted.push(item);
	}

	return inserted;
}
