import { and, desc, eq, lt } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import {
	participantEvents,
	participants,
	webhookEvents,
} from "../db/schema.ts";
import {
	mergeReconnections,
	sortForDisplay,
	type ParticipantState,
} from "../domain/presence.ts";

type Db = ReturnType<typeof getDb>;

export interface SessionParticipant {
	participantUuid: string;
	displayName: string | null;
	firstJoinedAt: Date | null;
	/** 현재 접속 중인지 */
	isPresent: boolean;
	/** 마지막으로 반영된 이벤트 시각. 퇴장자의 경우 나간 시각이다. */
	lastOccurredAt: Date;
	/** 몇 번 접속했는지. 1보다 크면 재접속한 사람이다. */
	connectionCount: number;
	/** 참가자가 적은 상태 메시지 */
	statusMessage: string | null;
	/**
	 * 요청한 브라우저의 IP 와 이 참가자의 Zoom 접속 IP 가 같은가.
	 *
	 * 같은 IP 를 여러 명이 쓰면(같은 사무실/집) 아무에게도 표시하지 않는다.
	 * 권한이 아니라 힌트다. 상세는 http/client-ip.ts 주석 참고.
	 */
	isYou: boolean;
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
	clientIp?: string | null,
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
			meetingId: participants.meetingId,
			meetingUuid: participants.meetingUuid,
			participantUuid: participants.participantUuid,
			displayName: participants.displayName,
			publicIp: participants.publicIp,
			statusMessage: participants.statusMessage,
			statusUpdatedAt: participants.statusUpdatedAt,
			firstJoinedAt: participants.firstJoinedAt,
			isPresent: participants.isPresent,
			lastEventType: participants.lastEventType,
			lastOccurredAt: participants.lastOccurredAt,
		})
		.from(participants)
		.where(eq(participants.meetingUuid, session.meetingUuid));

	// event_type 은 text 컬럼이라 넓은 타입으로 돌아온다. 도메인 타입으로 좁힌다.
	const states: ParticipantState[] = rows.map((row) => ({
		...row,
		lastEventType: row.lastEventType === "joined" ? "joined" : "left",
	}));

	// participant_uuid 는 접속마다 새로 발급되므로 같은 사람이 여러 행으로 쪼개진다.
	// 조회 시점에 합친다. 상세는 presence.ts 의 mergeReconnections 주석 참고.
	const people = sortForDisplay(mergeReconnections(states));

	// IP 가 정확히 한 명과 일치할 때만 "당신"으로 본다.
	// 같은 네트워크를 여러 명이 쓰면 누구인지 특정할 수 없다.
	const ipMatches = clientIp
		? people.filter((p) => p.publicIp && p.publicIp === clientIp)
		: [];
	const youUuid = ipMatches.length === 1 ? ipMatches[0]?.participantUuid : null;

	return {
		meetingId,
		meetingUuid: session.meetingUuid,
		count: people.filter((p) => p.isPresent).length,
		totalCount: people.length,
		updatedAt: session.lastOccurredAt,
		participants: people.map((p) => ({
			participantUuid: p.participantUuid,
			displayName: p.displayName,
			firstJoinedAt: p.firstJoinedAt,
			isPresent: p.isPresent,
			lastOccurredAt: p.lastOccurredAt,
			connectionCount: p.connectionCount,
			statusMessage: p.statusMessage,
			// publicIp 는 응답에 넣지 않는다. 일치 여부만 알린다.
			isYou: youUuid !== null && p.participantUuid === youUuid,
		})),
	};
}

export interface LogEntry {
	id: string;
	occurredAt: Date;
	receivedAt: Date;
	eventType: string;
	displayName: string | null;
	participantUuid: string;
	userId: string | null;
	publicIp: string | null;
	leaveReason: string | null;
	/** 같은 참가자·같은 발생 시각에 반대 이벤트가 있으면 소회의실 이동이다. */
	isRoomMove: boolean;
	/** raw=true 로 요청했을 때만 담는다. */
	payload?: unknown;
}

export interface LogPage {
	meetingId: string;
	meetingUuid: string | null;
	entries: LogEntry[];
	/** 다음 페이지 요청에 쓸 값. 없으면 마지막 페이지다. */
	nextCursor: string | null;
}

/**
 * 입퇴장 로그를 최신순으로 읽는다.
 *
 * 커서는 occurred_at 이다. 같은 시각의 이벤트가 여러 개일 수 있으므로
 * id 를 보조 정렬키로 써서 페이지 경계에서 빠지거나 겹치지 않게 한다.
 */
export async function getLogs(
	db: Db,
	meetingId: string,
	options: { limit: number; cursor?: string | null; raw?: boolean },
): Promise<LogPage> {
	const session = await findCurrentSession(db, meetingId);

	if (!session) {
		return { meetingId, meetingUuid: null, entries: [], nextCursor: null };
	}

	const limit = Math.min(Math.max(options.limit, 1), 200);
	const cursorDate = options.cursor ? new Date(options.cursor) : null;
	const validCursor =
		cursorDate && !Number.isNaN(cursorDate.getTime()) ? cursorDate : null;

	const rows = await db
		.select({
			id: participantEvents.id,
			occurredAt: participantEvents.occurredAt,
			receivedAt: participantEvents.createdAt,
			eventType: participantEvents.eventType,
			displayName: participantEvents.displayName,
			participantUuid: participantEvents.participantUuid,
			userId: participantEvents.userId,
			publicIp: participantEvents.publicIp,
			leaveReason: participantEvents.leaveReason,
			payload: webhookEvents.payload,
		})
		.from(participantEvents)
		.leftJoin(
			webhookEvents,
			eq(participantEvents.webhookEventId, webhookEvents.id),
		)
		.where(
			validCursor
				? and(
						eq(participantEvents.meetingUuid, session.meetingUuid),
						lt(participantEvents.occurredAt, validCursor),
					)
				: eq(participantEvents.meetingUuid, session.meetingUuid),
		)
		.orderBy(desc(participantEvents.occurredAt), desc(participantEvents.id))
		// 다음 페이지가 있는지 알기 위해 하나 더 가져온다
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;

	// 방 이동 판정: 같은 페이지 안에서 같은 참가자·같은 시각의 반대 이벤트를 찾는다.
	// 페이지 경계에 쌍이 걸치면 놓칠 수 있으나, 쌍은 항상 같은 시각이라 드물다.
	const pairKeys = new Set(
		page.map((r) => `${r.participantUuid}|${r.occurredAt.getTime()}|${r.eventType}`),
	);

	const entries: LogEntry[] = page.map((r) => {
		const opposite = r.eventType === "joined" ? "left" : "joined";
		return {
			id: r.id,
			occurredAt: r.occurredAt,
			receivedAt: r.receivedAt,
			eventType: r.eventType,
			displayName: r.displayName,
			participantUuid: r.participantUuid,
			userId: r.userId,
			publicIp: r.publicIp,
			leaveReason: r.leaveReason,
			isRoomMove: pairKeys.has(
				`${r.participantUuid}|${r.occurredAt.getTime()}|${opposite}`,
			),
			...(options.raw ? { payload: r.payload } : {}),
		};
	});

	return {
		meetingId,
		meetingUuid: session.meetingUuid,
		entries,
		nextCursor: hasMore
			? (page.at(-1)?.occurredAt.toISOString() ?? null)
			: null,
	};
}
