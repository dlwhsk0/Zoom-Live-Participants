/**
 * Report API 로 놓친 입퇴장을 메꾸는 규칙.
 *
 * 웹훅이 끊긴 동안의 입퇴장은 영영 오지 않는다(Zoom 재전송은 3회뿐).
 * 세션이 끝나면 Report API 가 접속 구간 목록을 주므로, 그것을 입퇴장
 * 이벤트로 펼쳐서 **이미 받은 웹훅에 없는 것만** 넣는다.
 *
 * 어려운 점은 Report API 에 participant_uuid 가 없다는 것이다.
 * 판정은 participant_uuid 단위라서 아무 값이나 붙이면 안 된다 —
 * 공백 전에 들어와 공백 중에 나간 사람의 `left` 가 다른 uuid 로 들어가면
 * 원래 행은 영원히 "접속 중" 으로 남는다. 그래서 이렇게 붙인다.
 *
 *   1. 구간의 user_id 가 웹훅에서 본 user_id 와 같으면 그 participant_uuid.
 *      user_id 는 접속 구간마다 새로 붙고, 같은 구간의 joined/left 웹훅에
 *      같은 값이 실려 온다.
 *   2. 아니면 소회의실 이동으로 이어진 구간들(같은 이름, 앞 구간의 퇴장 =
 *      다음 구간의 입장)을 하나로 묶고, 그 묶음 어디서든 찾은 uuid.
 *      공백 중에 방을 옮겼어도 공백 뒤 웹훅으로 이어진다.
 *   3. 그래도 없으면 묶음마다 결정적인 가짜 uuid. 다시 돌려도 같은 값이다.
 *
 * 이 파일은 DB 를 모른다. 계획만 세우고 넣는 일은 repository 가 한다.
 */
import { createHash } from "node:crypto";

import type { EventType, ParticipantEvent } from "./presence.ts";

/** Report API 와 웹훅의 시각은 둘 다 초 단위다. 반올림 차이만 허용한다. */
const TOLERANCE_MS = 2000;

/** 이 안에 웹훅을 하나라도 받았으면 그 시각에는 서버가 받고 있었다고 본다. */
export const RECEIVING_WINDOW_MS = 2 * 60 * 1000;

/**
 * 서버가 받고 있던 시각의 이벤트는 대부분 이미 있어야 한다.
 * 그 비율이 이보다 낮으면 빠진 게 아니라 **맞추는 규칙이 어긋난 것**이다 —
 * 그대로 넣으면 세션 전체가 두 겹이 된다. 그 세션은 넣지 않는다.
 */
const MIN_MATCH_RATIO = 0.8;
/** 표본이 이보다 적으면 비율을 믿지 않는다. */
const MIN_SAMPLE = 10;

export interface BackfillRecord {
	userId: string;
	name: string | null;
	joinTime: Date;
	leaveTime: Date | null;
}

/** 이미 받은 웹훅에서 정규화된 입퇴장. */
export interface KnownEvent {
	participantUuid: string;
	eventType: EventType;
	occurredAt: Date;
	userId: string | null;
	displayName: string | null;
}

export interface PlannedEvent {
	event: ParticipantEvent;
	/** 이 이벤트를 만든 Report API 구간. 출처로 남긴다. */
	recordIndex: number;
	/** 웹훅으로 이어 붙였는지(true), 가짜 uuid 인지(false). */
	anchored: boolean;
}

export interface BackfillPlan {
	events: PlannedEvent[];
	/** Report API 구간을 펼친 이벤트 수 */
	reportEvents: number;
	/** 그중 이미 있던 것 */
	matched: number;
	/** 서버가 받고 있던 시각의 이벤트 수, 그중 이미 있던 것 */
	receiving: number;
	receivingMatched: number;
	/** 넣지 않기로 했다면 그 이유 */
	skipReason: string | null;
}

export interface PlanInput {
	meetingId: string;
	meetingUuid: string;
	meetingStartedAt: Date | null;
	records: readonly BackfillRecord[];
	known: readonly KnownEvent[];
	/** 웹훅을 받은 시각들(ms, 오름차순). 회의와 무관하게 전부. */
	receivedAt: readonly number[];
	/** 비율 검사를 건너뛴다. 손으로 확인한 뒤에만 쓴다. */
	force?: boolean;
}

function near(a: Date, b: Date): boolean {
	return Math.abs(a.getTime() - b.getTime()) <= TOLERANCE_MS;
}

/** 정렬된 배열에서 at 의 앞뒤 window 안에 값이 있는가. */
export function receivingAt(
	receivedAt: readonly number[],
	at: number,
	window = RECEIVING_WINDOW_MS,
): boolean {
	let lo = 0;
	let hi = receivedAt.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((receivedAt[mid] as number) < at - window) lo = mid + 1;
		else hi = mid;
	}
	return lo < receivedAt.length && (receivedAt[lo] as number) <= at + window;
}

/** 묶음마다 결정적인 가짜 uuid. 웹훅의 uuid 와 섞이지 않게 접두사를 단다. */
export function syntheticParticipantUuid(
	meetingUuid: string,
	first: BackfillRecord,
): string {
	const digest = createHash("sha256")
		.update(`${meetingUuid}|${first.userId}|${first.joinTime.toISOString()}`)
		.digest("hex")
		.slice(0, 24);
	return `report-${digest}`;
}

export function planBackfill(input: PlanInput): BackfillPlan {
	const { known } = input;

	const order = input.records
		.map((record, index) => ({ record, index }))
		.sort((a, b) => a.record.joinTime.getTime() - b.record.joinTime.getTime());

	// 1. 구간 → 웹훅 uuid. user_id 가 같거나, 같은 이름·같은 시각의 입퇴장이 있으면.
	const uuidByUserId = new Map<string, string>();
	for (const event of known) {
		if (event.userId) uuidByUserId.set(event.userId, event.participantUuid);
	}

	const anchorOf = (record: BackfillRecord): string | null => {
		const byUserId = uuidByUserId.get(record.userId);
		if (byUserId) return byUserId;
		if (!record.name) return null;

		const hit = known.find(
			(event) =>
				event.displayName === record.name &&
				((event.eventType === "joined" && near(event.occurredAt, record.joinTime)) ||
					(event.eventType === "left" &&
						record.leaveTime !== null &&
						near(event.occurredAt, record.leaveTime))),
		);
		return hit?.participantUuid ?? null;
	};

	// 2. 소회의실 이동으로 이어진 구간을 묶는다.
	const chainOf = new Map<number, number>();
	const chains: { members: number[]; tail: BackfillRecord }[] = [];
	for (const { record, index } of order) {
		const previous = record.name
			? chains.findIndex(
					(chain) =>
						chain.tail.name === record.name &&
						chain.tail.leaveTime !== null &&
						near(chain.tail.leaveTime, record.joinTime),
				)
			: -1;

		if (previous >= 0) {
			const chain = chains[previous] as (typeof chains)[number];
			chain.members.push(index);
			chain.tail = record;
			chainOf.set(index, previous);
		} else {
			chains.push({ members: [index], tail: record });
			chainOf.set(index, chains.length - 1);
		}
	}

	const chainUuid = chains.map((chain) => {
		for (const member of chain.members) {
			const anchor = anchorOf(input.records[member] as BackfillRecord);
			if (anchor) return { uuid: anchor, anchored: true };
		}
		const first = input.records[chain.members[0] as number] as BackfillRecord;
		return {
			uuid: syntheticParticipantUuid(input.meetingUuid, first),
			anchored: false,
		};
	});

	// 3. 구간을 입퇴장으로 펼치고, 이미 있는 것은 뺀다.
	const isKnown = (
		eventType: EventType,
		at: Date,
		record: BackfillRecord,
		participantUuid: string,
	): boolean =>
		known.some(
			(event) =>
				event.eventType === eventType &&
				near(event.occurredAt, at) &&
				(event.participantUuid === participantUuid ||
					event.userId === record.userId ||
					(record.name !== null && event.displayName === record.name)),
		);

	const events: PlannedEvent[] = [];
	const seen = new Set<string>();
	let reportEvents = 0;
	let matched = 0;
	let receiving = 0;
	let receivingMatched = 0;

	for (const { record, index } of order) {
		const own = anchorOf(record);
		const chain = chainUuid[chainOf.get(index) as number] as {
			uuid: string;
			anchored: boolean;
		};
		const participantUuid = own ?? chain.uuid;
		const anchored = own !== null || chain.anchored;

		const sides: [EventType, Date | null][] = [
			["joined", record.joinTime],
			["left", record.leaveTime],
		];

		for (const [eventType, at] of sides) {
			if (!at) continue;

			// 같은 구간이 두 번 실려 오는 경우가 있다
			const key = `${participantUuid}|${eventType}|${at.getTime()}`;
			if (seen.has(key)) continue;
			seen.add(key);

			reportEvents++;
			const wasReceiving = receivingAt(input.receivedAt, at.getTime());
			if (wasReceiving) receiving++;

			if (isKnown(eventType, at, record, participantUuid)) {
				matched++;
				if (wasReceiving) receivingMatched++;
				continue;
			}

			events.push({
				recordIndex: index,
				anchored,
				event: {
					meetingId: input.meetingId,
					meetingUuid: input.meetingUuid,
					meetingStartedAt: input.meetingStartedAt,
					participantUuid,
					eventType,
					occurredAt: at,
					displayName: record.name,
					userId: record.userId,
					// Report API 는 IP 를 주지 않는다
					publicIp: null,
					privateIp: null,
					leaveReason: null,
				},
			});
		}
	}

	let skipReason: string | null = null;
	if (
		!input.force &&
		receiving >= MIN_SAMPLE &&
		receivingMatched / receiving < MIN_MATCH_RATIO
	) {
		skipReason =
			`서버가 받고 있던 시각의 이벤트 ${receiving}건 중 ${receivingMatched}건만 맞았다. ` +
			"빠진 것이 아니라 맞추는 규칙이 어긋났을 수 있어 넣지 않는다";
	}

	return {
		events: skipReason ? [] : events,
		reportEvents,
		matched,
		receiving,
		receivingMatched,
		skipReason,
	};
}
