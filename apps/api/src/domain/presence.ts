/**
 * 접속 판정 규칙.
 *
 * Zoom은 소회의실 이동에도 participant_left 를 보낸다.
 * leave_reason 문자열로는 방 이동과 진짜 퇴장을 구분할 수 없다
 * (실측: 방 이동의 69%가 평범한 "left the meeting" 으로 옴).
 *
 * 실제 신호는 발생 시각이다. 방을 이동하면 같은 participant_uuid 에 대해
 * 동일한 발생 시각으로 left 와 joined 가 함께 온다.
 *
 * 규칙: 참가자별로 발생 시각이 가장 늦은 이벤트를 본다.
 *       시각이 같으면 joined 가 left 를 이긴다.
 *
 * 근거는 docs/webhook-data-reference.md, 설계 의도는 docs/plan.md 4장.
 */

export type EventType = "joined" | "left";

export interface ParticipantEvent {
	meetingId: string;
	meetingUuid: string;
	participantUuid: string;
	eventType: EventType;
	/** join_time 또는 leave_time. 수신 시각이 아니다. */
	occurredAt: Date;
	displayName: string | null;
	userId: string | null;
	leaveReason: string | null;
}

export interface ParticipantState {
	meetingId: string;
	meetingUuid: string;
	participantUuid: string;
	displayName: string | null;
	isPresent: boolean;
	lastEventType: EventType;
	lastOccurredAt: Date;
	firstJoinedAt: Date | null;
}

/** 세션 내 참가자를 가리키는 키. */
export function participantKey(
	meetingUuid: string,
	participantUuid: string,
): string {
	return `${meetingUuid}|${participantUuid}`;
}

/**
 * 새 이벤트를 반영해야 하는지 판단한다.
 *
 * DB의 ON CONFLICT ... WHERE 절과 동일한 조건이다.
 * 이 조건 덕분에 도착 순서가 뒤바뀌거나 중복 수신되어도 결과가 같다.
 */
export function shouldAdvance(
	current: ParticipantState | undefined,
	incoming: ParticipantEvent,
): boolean {
	if (!current) {
		return true;
	}

	const incomingAt = incoming.occurredAt.getTime();
	const currentAt = current.lastOccurredAt.getTime();

	if (incomingAt > currentAt) {
		return true;
	}

	// 동일 시각이면 joined 가 이긴다. 이게 방 이동에서 접속이 끊기지 않게 한다.
	return incomingAt === currentAt && incoming.eventType === "joined";
}

/** 가장 이른 시각을 고른다. null 은 무시한다 (SQL의 LEAST와 같은 동작). */
function earliest(a: Date | null, b: Date | null): Date | null {
	if (!a) return b;
	if (!b) return a;
	return a.getTime() <= b.getTime() ? a : b;
}

export function applyEvent(
	current: ParticipantState | undefined,
	incoming: ParticipantEvent,
): ParticipantState {
	const incomingFirstJoined =
		incoming.eventType === "joined" ? incoming.occurredAt : null;

	return {
		meetingId: incoming.meetingId,
		meetingUuid: incoming.meetingUuid,
		participantUuid: incoming.participantUuid,
		displayName: incoming.displayName,
		isPresent: incoming.eventType === "joined",
		lastEventType: incoming.eventType,
		lastOccurredAt: incoming.occurredAt,
		firstJoinedAt: earliest(current?.firstJoinedAt ?? null, incomingFirstJoined),
	};
}

/**
 * 이벤트 묶음에서 참가자별 상태를 계산한다.
 *
 * 입력 순서에 의존하지 않는다. 어떤 순서로 넣어도, 중복이 섞여도 결과가 같다.
 */
export function reducePresence(
	events: readonly ParticipantEvent[],
): Map<string, ParticipantState> {
	const states = new Map<string, ParticipantState>();

	for (const event of events) {
		const key = participantKey(event.meetingUuid, event.participantUuid);
		const current = states.get(key);

		if (shouldAdvance(current, event)) {
			states.set(key, applyEvent(current, event));
		}
	}

	return states;
}

/**
 * meeting.ended 반영. 해당 세션의 접속자를 전부 정리한다.
 *
 * left 웹훅이 누락되어 남은 유령 접속자를 걷어내는 지점이다.
 */
export function applyMeetingEnded(
	states: Map<string, ParticipantState>,
	meetingUuid: string,
): void {
	for (const [key, state] of states) {
		if (state.meetingUuid === meetingUuid && state.isPresent) {
			states.set(key, { ...state, isPresent: false, lastEventType: "left" });
		}
	}
}

export function listPresent(
	states: Map<string, ParticipantState>,
	meetingUuid?: string,
): ParticipantState[] {
	return [...states.values()]
		.filter((s) => s.isPresent)
		.filter((s) => !meetingUuid || s.meetingUuid === meetingUuid)
		.sort((a, b) => {
			const at = a.firstJoinedAt?.getTime() ?? 0;
			const bt = b.firstJoinedAt?.getTime() ?? 0;
			return at - bt;
		});
}

/** 회의방의 현재 세션 = 마지막 이벤트가 가장 최근인 meeting_uuid. */
export function latestMeetingUuid(
	states: Map<string, ParticipantState>,
	meetingId: string,
): string | null {
	let best: ParticipantState | null = null;

	for (const state of states.values()) {
		if (state.meetingId !== meetingId) continue;
		if (!best || state.lastOccurredAt > best.lastOccurredAt) {
			best = state;
		}
	}

	return best?.meetingUuid ?? null;
}
