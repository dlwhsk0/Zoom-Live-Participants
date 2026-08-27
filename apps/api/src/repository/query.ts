import { and, desc, eq } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { participants } from "../db/schema.ts";

type Db = ReturnType<typeof getDb>;

export interface PresentParticipant {
	participantUuid: string;
	displayName: string | null;
	firstJoinedAt: Date | null;
}

export interface PresenceSnapshot {
	meetingId: string;
	meetingUuid: string | null;
	count: number;
	updatedAt: Date | null;
	participants: PresentParticipant[];
}

/**
 * 회의방의 현재 세션을 찾는다.
 *
 * meeting_uuid 는 회의를 새로 열 때마다 바뀌므로,
 * 가장 최근 이벤트가 속한 세션이 현재 세션이다.
 */
export async function findCurrentSession(
	db: Db,
	meetingId: string,
): Promise<{ meetingUuid: string; lastOccurredAt: Date } | null> {
	const rows = await db
		.select({
			meetingUuid: participants.meetingUuid,
			lastOccurredAt: participants.lastOccurredAt,
		})
		.from(participants)
		.where(eq(participants.meetingId, meetingId))
		.orderBy(desc(participants.lastOccurredAt))
		.limit(1);

	return rows[0] ?? null;
}

export async function getPresenceSnapshot(
	db: Db,
	meetingId: string,
): Promise<PresenceSnapshot> {
	const session = await findCurrentSession(db, meetingId);

	if (!session) {
		return {
			meetingId,
			meetingUuid: null,
			count: 0,
			updatedAt: null,
			participants: [],
		};
	}

	const rows = await db
		.select({
			participantUuid: participants.participantUuid,
			displayName: participants.displayName,
			firstJoinedAt: participants.firstJoinedAt,
		})
		.from(participants)
		.where(
			and(
				eq(participants.meetingUuid, session.meetingUuid),
				eq(participants.isPresent, true),
			),
		)
		.orderBy(participants.firstJoinedAt);

	return {
		meetingId,
		meetingUuid: session.meetingUuid,
		count: rows.length,
		updatedAt: session.lastOccurredAt,
		participants: rows,
	};
}
