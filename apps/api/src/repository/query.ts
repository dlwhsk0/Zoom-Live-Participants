import { and, desc, eq, lt, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import {
	participantEvents,
	participants,
	webhookEvents,
} from "../db/schema.ts";
import {
	mergeReconnections,
	type ParticipantState,
	sortForDisplay,
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
	/**
	 * 이 세션에서 실제로 머문 시간의 합(초).
	 *
	 * 나갔다 들어온 공백은 빠진다. firstJoinedAt 부터의 경과 시간과 다르다.
	 * **진행 중인 구간은 포함하지 않는다.** 지금 접속 중인 사람은
	 * 화면이 lastOccurredAt 부터 흐른 시간을 더해서 보여준다
	 * (접속 중이면 lastOccurredAt 이 곧 마지막 입장 시각이다).
	 */
	onlineSeconds: number;
	/** 참가자가 적은 상태 메시지 */
	statusMessage: string | null;
	/**
	 * firstJoinedAt 을 믿을 수 없는가.
	 * 서버가 꺼져 있어 입장 이벤트를 놓친 경우다. 화면은 경과 시간을 숨긴다.
	 */
	joinTimeUncertain: boolean;
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
	/**
	 * 이 회의 세션이 시작된 시각.
	 *
	 * Zoom 이 모든 웹훅에 실어 보내는 object.start_time 이다.
	 * 서버가 늦게 켜져 앞부분을 놓쳤어도 이 값은 정확하다.
	 */
	startedAt: Date | null;
	/**
	 * startedAt 이 추정값인가.
	 *
	 * start_time 을 한 번도 못 받은 옛 데이터에서만 true 다.
	 * 이 경우 가장 이른 기록 시각으로 물러선다 — 실제 시작보다 늦다.
	 */
	startedAtEstimated: boolean;
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
			startedAt: null,
			startedAtEstimated: false,
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
			meetingStartedAt: participants.meetingStartedAt,
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

	const [uncertain, onlineSeconds] = await Promise.all([
		findUncertainJoinTimes(db, session.meetingUuid),
		findOnlineSeconds(db, session.meetingUuid),
	]);

	// event_type 은 text 컬럼이라 넓은 타입으로 돌아온다. 도메인 타입으로 좁힌다.
	const states: ParticipantState[] = rows.map((row) => ({
		...row,
		lastEventType: row.lastEventType === "joined" ? "joined" : "left",
		joinTimeUncertain: uncertain.has(row.participantUuid),
		onlineSeconds: onlineSeconds.get(row.participantUuid) ?? 0,
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
		...resolveSessionStart(states, people),
		updatedAt: session.lastOccurredAt,
		participants: people.map((p) => ({
			participantUuid: p.participantUuid,
			displayName: p.displayName,
			firstJoinedAt: p.firstJoinedAt,
			isPresent: p.isPresent,
			lastOccurredAt: p.lastOccurredAt,
			connectionCount: p.connectionCount,
			onlineSeconds: p.onlineSeconds,
			statusMessage: p.statusMessage,
			// firstJoinedAt 이 null 이어도 알 수 없는 것은 마찬가지다
			joinTimeUncertain: p.joinTimeUncertain || p.firstJoinedAt === null,
			// publicIp 는 응답에 넣지 않는다. 일치 여부만 알린다.
			isYou: youUuid !== null && p.participantUuid === youUuid,
		})),
	};
}

/**
 * 세션 시작 시각을 정한다.
 *
 * start_time 은 세션 상수라 어느 행에서 읽어도 같다. 한 행만 있으면 충분하다.
 * 그 값이 없는 것은 이 컬럼이 생기기 전에 쌓인 데이터뿐이고,
 * 그때는 가장 이른 기록 시각으로 물러선다. 서버가 늦게 켜졌다면
 * 이 추정값은 실제 시작보다 늦으므로 화면에 "부터 기록" 이라고 밝힌다.
 */
export function resolveSessionStart(
	states: readonly ParticipantState[],
	people: readonly { firstJoinedAt: Date | null; lastOccurredAt: Date }[],
): { startedAt: Date | null; startedAtEstimated: boolean } {
	for (const state of states) {
		if (state.meetingStartedAt) {
			return { startedAt: state.meetingStartedAt, startedAtEstimated: false };
		}
	}

	let earliest: Date | null = null;
	for (const person of people) {
		const at = person.firstJoinedAt ?? person.lastOccurredAt;
		if (!earliest || at.getTime() < earliest.getTime()) earliest = at;
	}

	return { startedAt: earliest, startedAtEstimated: earliest !== null };
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
		page.map(
			(r) => `${r.participantUuid}|${r.occurredAt.getTime()}|${r.eventType}`,
		),
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

/**
 * 접속마다 실제로 머문 시간을 초 단위로 구한다.
 *
 * joined 다음에 오는 left 까지가 한 구간이다. 그 구간들의 합이다.
 * 나갔다 들어온 사이의 공백은 어느 구간에도 속하지 않으므로 자연히 빠진다.
 *
 * 같은 시각의 left + joined 쌍(소회의실 이동)은 길이 0 인 구간을 만들고
 * 곧바로 다음 구간이 열리므로 이동 때문에 시간이 끊기지 않는다.
 * 정렬에서 left 를 먼저 두는 이유가 이것이다.
 *
 * joined 가 연달아 오면(left 를 놓친 경우) 뒤엣것부터 센다.
 * 실제보다 적게 잡히지만 없는 시간을 만들어내지는 않는다.
 *
 * 진행 중인 구간은 포함하지 않는다. 화면이 lastOccurredAt 부터
 * 흐른 시간을 더해서 보여준다.
 */
async function findOnlineSeconds(
	db: Db,
	meetingUuid: string,
): Promise<Map<string, number>> {
	const rows = await db.execute<{
		participant_uuid: string;
		seconds: number | string;
	}>(sql`
		select
			participant_uuid,
			sum(
				case
					when event_type = 'left' and prev_type = 'joined'
					then extract(epoch from (occurred_at - prev_at))
					else 0
				end
			) as seconds
		from (
			select
				participant_uuid,
				event_type,
				occurred_at,
				lag(event_type) over w as prev_type,
				lag(occurred_at) over w as prev_at
			from participant_events
			where meeting_uuid = ${meetingUuid}
			window w as (
				partition by participant_uuid
				order by occurred_at, case when event_type = 'left' then 0 else 1 end
			)
		) t
		group by participant_uuid
	`);

	return new Map(rows.map((r) => [r.participant_uuid, Number(r.seconds)]));
}

/**
 * 입장 시각을 믿을 수 없는 참가자를 찾는다.
 *
 * 규칙: 그 참가자의 **가장 이른 이벤트에 `left` 가 포함되면** 불확실하다.
 *
 * - `left` 만 있다 → 입장을 못 봤다
 * - 같은 시각에 `left` + `joined` → 방 이동이다. 이미 회의에 있었다는 뜻
 * - `joined` 만 있다 → 정확하다
 *
 * 둘 다 실제 입장은 우리가 아는 시각보다 이르다.
 */
async function findUncertainJoinTimes(
	db: Db,
	meetingUuid: string,
): Promise<Set<string>> {
	const rows = await db.execute<{ participant_uuid: string }>(sql`
		select participant_uuid
		from (
			select
				participant_uuid,
				event_type,
				occurred_at,
				min(occurred_at) over (partition by participant_uuid) as first_at
			from participant_events
			where meeting_uuid = ${meetingUuid}
		) t
		where occurred_at = first_at and event_type = 'left'
		group by participant_uuid
	`);

	return new Set(rows.map((r) => r.participant_uuid));
}
