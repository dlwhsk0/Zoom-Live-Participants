import { desc, eq } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { participants } from "../db/schema.ts";

type Db = ReturnType<typeof getDb>;

export interface SessionParticipant {
	participantUuid: string;
	displayName: string | null;
	firstJoinedAt: Date | null;
	/** 현재 접속 중인지 */
	isPresent: boolean;
	/** 마지막으로 반영된 이벤트 시각. 퇴장자의 경우 나간 시각이다. */
	lastOccurredAt: Date;
}

export interface PresenceSnapshot {
	meetingId: string;
	meetingUuid: string | null;
	/** 현재 접속 중인 인원 */
	count: number;
	/** 이 세션에 한 번이라도 들어온 총 인원 */
	totalCount: number;
	updatedAt: Date | null;
	/** 접속 중인 사람이 앞, 나간 사람이 뒤. 각 그룹 안에서는 최초 입장순. */
	participants: SessionParticipant[];
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
			totalCount: 0,
			updatedAt: null,
			participants: [],
		};
	}

	// 세션에 한 번이라도 들어온 사람을 전부 가져온다.
	// 나간 사람도 회의가 끝날 때까지 기록으로 남는다.
	const rows = await db
		.select({
			participantUuid: participants.participantUuid,
			displayName: participants.displayName,
			firstJoinedAt: participants.firstJoinedAt,
			isPresent: participants.isPresent,
			lastOccurredAt: participants.lastOccurredAt,
		})
		.from(participants)
		.where(eq(participants.meetingUuid, session.meetingUuid))
		.orderBy(
			desc(participants.isPresent),
			participants.firstJoinedAt,
		);

	return {
		meetingId,
		meetingUuid: session.meetingUuid,
		count: rows.filter((r) => r.isPresent).length,
		totalCount: rows.length,
		updatedAt: session.lastOccurredAt,
		participants: rows,
	};
}
