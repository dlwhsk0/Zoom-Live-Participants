import { and, desc, eq, lt, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import {
	nameAliases,
	participantEvents,
	participants,
	webhookEvents,
} from "../db/schema.ts";
import {
	type Interval,
	mergeReconnections,
	type ParticipantState,
	sortForDisplay,
	unionSeconds,
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
	 * 회의를 연 사람.
	 *
	 * 시작 시각에 처음 들어온 사람이다. 그 시각에 아무도 못 봤으면 null 이다
	 * (서버가 늦게 켜져 앞부분을 놓친 경우).
	 */
	openedBy: string | null;
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
/**
 * 별칭을 전부 읽어 이름 치환표로 만든다.
 *
 * 조회 경로가 매 요청 부른다. 별칭은 몇십 개를 넘지 않으므로 통째로 읽는다.
 */
export async function loadAliasMap(db: Db): Promise<Map<string, string>> {
	const rows = await db
		.select({ alias: nameAliases.alias, canonical: nameAliases.canonical })
		.from(nameAliases);

	return new Map(rows.map((r) => [r.alias, r.canonical]));
}

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
			openedBy: null,
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

	const [uncertain, intervals, aliases, firstJoin] = await Promise.all([
		findUncertainJoinTimes(db, session.meetingUuid),
		findIntervals(db, session.meetingUuid),
		loadAliasMap(db),
		findFirstJoin(db, session.meetingUuid),
	]);

	// event_type 은 text 컬럼이라 넓은 타입으로 돌아온다. 도메인 타입으로 좁힌다.
	//
	// 별칭은 여기서 이름을 갈아 끼운다. 병합이 이름으로 판단하므로,
	// 합치기 전에 대표 이름으로 바꿔 두면 그대로 한 사람이 된다.
	// 원본 행은 그대로다 — 바뀌는 것은 이 조회의 결과뿐이다.
	const states: ParticipantState[] = rows.map((row) => ({
		...row,
		displayName: row.displayName
			? (aliases.get(row.displayName) ?? row.displayName)
			: row.displayName,
		lastEventType: row.lastEventType === "joined" ? "joined" : "left",
		joinTimeUncertain: uncertain.has(row.participantUuid),
		intervals: intervals.get(row.participantUuid) ?? [],
	}));

	// participant_uuid 는 접속마다 새로 발급되므로 같은 사람이 여러 행으로 쪼개진다.
	// 조회 시점에 합친다. 상세는 presence.ts 의 mergeReconnections 주석 참고.
	const people = sortForDisplay(mergeReconnections(states));

	// 진행 중인 구간까지 포함해 지금 시점의 누적 시간을 낸다.
	// 화면이 더 보태지 않아도 되도록 서버가 끝까지 계산한다 —
	// 구간이 겹칠 수 있어 화면에서는 제대로 합칠 수 없기 때문이다.
	const now = new Date();

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
		openedBy: resolveOpener(states, firstJoin, aliases),
		updatedAt: session.lastOccurredAt,
		participants: people.map((p) => ({
			participantUuid: p.participantUuid,
			displayName: p.displayName,
			firstJoinedAt: p.firstJoinedAt,
			isPresent: p.isPresent,
			lastOccurredAt: p.lastOccurredAt,
			connectionCount: p.connectionCount,
			onlineSeconds: unionSeconds(p.intervals, now),
			statusMessage: p.statusMessage,
			// firstJoinedAt 이 null 이어도 알 수 없는 것은 마찬가지다
			joinTimeUncertain: p.joinTimeUncertain || p.firstJoinedAt === null,
			// publicIp 는 응답에 넣지 않는다. 일치 여부만 알린다.
			isYou: youUuid !== null && p.participantUuid === youUuid,
		})),
	};
}

/**
 * 세션에서 가장 이른 입장 이벤트.
 *
 * 회의를 연 사람을 찾는 데 쓴다. 같은 시각에 여럿이면 아무나 하나다.
 */
async function findFirstJoin(
	db: Db,
	meetingUuid: string,
): Promise<{ displayName: string | null; occurredAt: Date } | null> {
	const rows = await db
		.select({
			displayName: participantEvents.displayName,
			occurredAt: participantEvents.occurredAt,
		})
		.from(participantEvents)
		.where(
			and(
				eq(participantEvents.meetingUuid, meetingUuid),
				eq(participantEvents.eventType, "joined"),
			),
		)
		.orderBy(participantEvents.occurredAt)
		.limit(1);

	return rows[0] ?? null;
}

/** 회의를 연 사람과 시작 시각 사이에 허용하는 간격. */
const OPENER_WINDOW_MS = 60_000;

/**
 * 회의를 연 사람을 정한다.
 *
 * 시작 시각 무렵에 처음 들어온 사람이다. 실측에서 둘은 같은 초였다.
 *
 * `host_id` 는 쓸 수 없다. 회의방을 소유한 계정이라 방마다 고정이고
 * 참가자의 user_id 와 이어지지 않는다. 오늘 누가 문을 열었는지는
 * 그 값으로 알 수 없다.
 *
 * 시작 시각을 모르거나(추정) 첫 입장이 시작보다 한참 뒤면 null 이다.
 * 서버가 늦게 켜져 진짜 첫 사람을 놓친 경우이므로, 그때 목록의 첫
 * 사람을 문 연 사람이라고 부르면 틀린 사람을 지목하게 된다.
 */
function resolveOpener(
	states: readonly ParticipantState[],
	firstJoin: { displayName: string | null; occurredAt: Date } | null,
	aliases: Map<string, string>,
): string | null {
	if (!firstJoin?.displayName) return null;

	const startedAt = states.find((s) => s.meetingStartedAt)?.meetingStartedAt;
	if (!startedAt) return null;

	const gap = firstJoin.occurredAt.getTime() - startedAt.getTime();
	if (gap > OPENER_WINDOW_MS) return null;

	return aliases.get(firstJoin.displayName) ?? firstJoin.displayName;
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
	/**
	 * 이 시각에 같은 사람의 **다른 접속**이 살아 있었는가.
	 *
	 * 노트북과 폰으로 동시에 들어온 경우다. 로그만 보면 한 사람이 두 번
	 * 들어오고 한 번만 나간 것처럼 보여 헷갈린다. 그 상황임을 표시한다.
	 *
	 * 재접속 인수인계(새 연결의 joined 가 옛 연결의 left 보다 먼저 오는
	 * 구간)도 여기에 걸린다. 기록상 실제로 겹치는 것이 맞다.
	 */
	isConcurrent: boolean;
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

	const concurrent = await findConcurrentTimes(db, session.meetingUuid, page);

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
			isConcurrent: concurrent.has(r.id),
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

/** 구간이 그 시각을 덮는가. 끝나는 순간은 덮지 않는 것으로 본다. */
function covers(interval: Interval, at: number): boolean {
	if (interval.start.getTime() > at) return false;
	return interval.end === null || interval.end.getTime() > at;
}

/**
 * 같은 사람의 다른 접속이 살아 있던 이벤트를 찾는다.
 *
 * 사람은 이름으로 묶는다. 병합 규칙과 같은 기준이어야 로그와 화면이
 * 어긋나지 않는다. 별칭도 같이 적용한다.
 *
 * 같은 participant_uuid 는 제외한다. 소회의실 이동은 같은 uuid 에서
 * left 와 joined 가 같은 시각에 나는 것이라 동시 접속이 아니다.
 */
async function findConcurrentTimes(
	db: Db,
	meetingUuid: string,
	page: readonly { id: string; participantUuid: string; occurredAt: Date }[],
): Promise<Set<string>> {
	if (page.length === 0) return new Set();

	const [intervals, aliases, owners] = await Promise.all([
		findIntervals(db, meetingUuid),
		loadAliasMap(db),
		db
			.select({
				participantUuid: participants.participantUuid,
				displayName: participants.displayName,
			})
			.from(participants)
			.where(eq(participants.meetingUuid, meetingUuid)),
	]);

	/** participant_uuid → 사람 이름(별칭 적용) */
	const personOf = new Map<string, string>();
	for (const owner of owners) {
		if (!owner.displayName) continue;
		personOf.set(
			owner.participantUuid,
			aliases.get(owner.displayName) ?? owner.displayName,
		);
	}

	/** 사람 → 그 사람의 접속들 */
	const byPerson = new Map<string, { uuid: string; intervals: Interval[] }[]>();
	for (const [uuid, list] of intervals) {
		const person = personOf.get(uuid);
		if (!person) continue;
		const connections = byPerson.get(person) ?? [];
		connections.push({ uuid, intervals: list });
		byPerson.set(person, connections);
	}

	const flagged = new Set<string>();

	for (const entry of page) {
		const person = personOf.get(entry.participantUuid);
		if (!person) continue;

		const connections = byPerson.get(person);
		if (!connections || connections.length < 2) continue;

		const at = entry.occurredAt.getTime();
		const overlapped = connections.some(
			(c) => c.uuid !== entry.participantUuid && c.intervals.some((i) => covers(i, at)),
		);

		if (overlapped) flagged.add(entry.id);
	}

	return flagged;
}

/**
 * 접속마다 회의에 머문 구간을 뽑는다.
 *
 * joined 다음에 오는 left 까지가 한 구간이다. 마지막이 joined 로 끝나면
 * 아직 접속 중이므로 end 를 null 로 둔다.
 *
 * 같은 시각의 left + joined 쌍(소회의실 이동)은 길이 0 인 구간을 만들고
 * 곧바로 다음 구간이 열리므로 이동 때문에 시간이 끊기지 않는다.
 * 정렬에서 left 를 먼저 두는 이유가 이것이다.
 *
 * joined 가 연달아 오면(left 를 놓친 경우) 앞엣것은 버린다.
 * 실제보다 적게 잡히지만 없는 시간을 만들어내지는 않는다.
 *
 * 구간을 그대로 돌려주는 이유는 합칠 때 겹침을 눌러야 하기 때문이다.
 * 노트북과 폰으로 동시에 접속하면 구간이 겹친다. 상세는
 * presence.ts 의 unionSeconds 주석 참고.
 */
async function findIntervals(
	db: Db,
	meetingUuid: string,
): Promise<Map<string, Interval[]>> {
	const rows = await db.execute<{
		participant_uuid: string;
		started_at: string | Date;
		ended_at: string | Date | null;
	}>(sql`
		select participant_uuid, started_at, ended_at
		from (
			select
				participant_uuid,
				occurred_at as started_at,
				event_type,
				lead(event_type) over w as next_type,
				case
					when lead(event_type) over w = 'left'
					then lead(occurred_at) over w
				end as ended_at
			from participant_events
			where meeting_uuid = ${meetingUuid}
			window w as (
				partition by participant_uuid
				order by occurred_at, case when event_type = 'left' then 0 else 1 end
			)
		) t
		where event_type = 'joined'
			and (next_type is null or next_type = 'left')
	`);

	const byUuid = new Map<string, Interval[]>();

	for (const row of rows) {
		const list = byUuid.get(row.participant_uuid) ?? [];
		list.push({
			start: new Date(row.started_at),
			end: row.ended_at === null ? null : new Date(row.ended_at),
		});
		byUuid.set(row.participant_uuid, list);
	}

	return byUuid;
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
