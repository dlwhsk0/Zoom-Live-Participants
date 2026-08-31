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
	/** 회의 세션 시작 시각. object.start_time 에서 온다. */
	meetingStartedAt: Date | null;
	participantUuid: string;
	eventType: EventType;
	/** join_time 또는 leave_time. 수신 시각이 아니다. */
	occurredAt: Date;
	displayName: string | null;
	userId: string | null;
	/** 공인 IP. 재접속 판별에 쓴다. */
	publicIp: string | null;
	leaveReason: string | null;
}

export interface ParticipantState {
	meetingId: string;
	meetingUuid: string;
	/** 회의 세션 시작 시각. 세션 안에서는 모든 참가자가 같은 값을 갖는다. */
	meetingStartedAt: Date | null;
	/**
	 * 이 접속으로 실제로 회의에 머문 시간(초). 닫힌 구간만 센다.
	 *
	 * 지금 접속 중이면 진행 중인 구간은 빠져 있다. 화면이
	 * lastOccurredAt 부터 흐른 시간을 더해서 보여준다.
	 *
	 * 로그 전체를 봐야 알 수 있으므로 조회 시점에 채운다.
	 */
	onlineSeconds: number;
	participantUuid: string;
	displayName: string | null;
	publicIp: string | null;
	statusMessage: string | null;
	statusUpdatedAt: Date | null;
	/**
	 * first_joined_at 을 믿을 수 없는가.
	 *
	 * 이 참가자의 가장 이른 이벤트에 left 가 있으면 true 다.
	 * left 만 있으면 입장을 못 봤고, 같은 시각에 left + joined 면(방 이동)
	 * 이미 회의에 있었다는 뜻이다. 어느 쪽이든 실제 입장은 더 이르다.
	 */
	joinTimeUncertain: boolean;
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

/** 더 이른 시각을 가진 쪽의 플래그를 고른다. */
function earlierWins(
	aAt: Date | null,
	aFlag: boolean,
	bAt: Date | null,
	bFlag: boolean,
): boolean {
	if (!aAt) return bAt ? bFlag : aFlag || bFlag;
	if (!bAt) return aFlag;
	return aAt.getTime() <= bAt.getTime() ? aFlag : bFlag;
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
		// 세션 상수지만, 혹시 빠진 웹훅이 있어도 한 번이라도 받았으면 유지한다.
		meetingStartedAt:
			incoming.meetingStartedAt ?? current?.meetingStartedAt ?? null,
		participantUuid: incoming.participantUuid,
		displayName: incoming.displayName,
		publicIp: incoming.publicIp,
		// 상태 메시지는 웹훅으로 오지 않는다. 별도 API 로만 바뀐다.
		statusMessage: current?.statusMessage ?? null,
		statusUpdatedAt: current?.statusUpdatedAt ?? null,
		// 로그 전체를 봐야 알 수 있다. 조회 시점에 채운다.
		joinTimeUncertain: current?.joinTimeUncertain ?? false,
		onlineSeconds: current?.onlineSeconds ?? 0,
		isPresent: incoming.eventType === "joined",
		lastEventType: incoming.eventType,
		lastOccurredAt: incoming.occurredAt,
		firstJoinedAt: earliest(
			current?.firstJoinedAt ?? null,
			incomingFirstJoined,
		),
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

/* ------------------------------------------------------------------ *
 * 재접속 합치기
 *
 * participant_uuid 는 접속(connection) 단위 식별자다.
 * 회의를 나갔다 다시 들어오면 새 값이 발급되므로 같은 사람이 여러 행으로 쪼개진다.
 *
 * 실측 근거 (docs/webhook-data-reference.md):
 * 세션 내 재접속 7건 전부에서 public_ip 가 그대로 유지됐다.
 * 와이파이 끊김(Client Close.) 케이스도 포함된다.
 * 반면 user_id 는 방을 옮길 때마다 바뀌고, email 과 participant_user_id 는 거의 비어 있다.
 * ------------------------------------------------------------------ */

export interface MergedParticipant {
	/** 대표 participant_uuid. 가장 최근 접속의 값이다. */
	participantUuid: string;
	meetingId: string;
	meetingUuid: string;
	displayName: string | null;
	/** 내부용. API 응답에는 넣지 않는다. */
	publicIp: string | null;
	isPresent: boolean;
	/** 가장 이른 입장 시각. 재접속해도 경과 시간이 이어진다. */
	firstJoinedAt: Date | null;
	/** 가장 늦은 이벤트 시각. */
	lastOccurredAt: Date;
	/** 몇 번 접속했는지. 1보다 크면 재접속한 사람이다. */
	connectionCount: number;
	/** 참가자가 적은 상태 메시지. 재접속해도 이어진다. */
	statusMessage: string | null;
	/** firstJoinedAt 을 믿을 수 없으면 true. 화면에서 경과 시간을 숨긴다. */
	joinTimeUncertain: boolean;
	/**
	 * 이 세션에서 실제로 머문 시간의 합(초). 재접속 구간을 모두 더한 값이다.
	 *
	 * 공백은 빠진다. firstJoinedAt 부터의 경과 시간과는 다른 값이고,
	 * 자리를 지킨 정도를 나타내므로 이쪽이 "누적 접속 시간" 이다.
	 * 진행 중인 구간은 포함하지 않는다.
	 */
	onlineSeconds: number;
}

function toMerged(state: ParticipantState): MergedParticipant {
	return {
		participantUuid: state.participantUuid,
		meetingId: state.meetingId,
		meetingUuid: state.meetingUuid,
		displayName: state.displayName,
		publicIp: state.publicIp,
		isPresent: state.isPresent,
		firstJoinedAt: state.firstJoinedAt,
		lastOccurredAt: state.lastOccurredAt,
		onlineSeconds: state.onlineSeconds,
		connectionCount: 1,
		statusMessage: state.statusMessage,
		joinTimeUncertain: state.joinTimeUncertain,
	};
}

/** 상태 메시지는 가장 나중에 적힌 것을 남긴다. */
function laterStatus(
	a: { statusMessage: string | null; statusUpdatedAt: Date | null },
	b: { statusMessage: string | null; statusUpdatedAt: Date | null },
): string | null {
	if (!a.statusUpdatedAt) return b.statusMessage;
	if (!b.statusUpdatedAt) return a.statusMessage;
	return b.statusUpdatedAt.getTime() >= a.statusUpdatedAt.getTime()
		? b.statusMessage
		: a.statusMessage;
}

/**
 * 두 행을 같은 사람의 연속된 접속으로 볼 수 있는가.
 *
 * 앞 행이 이미 퇴장했고, 뒤 행이 그 이후에 시작했어야 한다.
 * 활동 구간이 겹치면 한 사람이 동시에 두 곳에 있다는 뜻이므로 다른 사람이다.
 * 같은 네트워크(NAT) 뒤의 동명이인이 이 경우에 해당한다.
 */
function isContinuation(
	previous: MergedParticipant,
	next: ParticipantState,
): boolean {
	if (previous.isPresent) {
		return false;
	}

	const nextStart = (next.firstJoinedAt ?? next.lastOccurredAt).getTime();
	return nextStart >= previous.lastOccurredAt.getTime();
}

function absorb(
	previous: MergedParticipant,
	previousStatusAt: Date | null,
	next: ParticipantState,
): MergedParticipant {
	return {
		// 대표값은 최근 접속 쪽을 쓴다. 이름도 마지막 것으로 갱신된다.
		participantUuid: next.participantUuid,
		meetingId: next.meetingId,
		meetingUuid: next.meetingUuid,
		displayName: next.displayName,
		publicIp: next.publicIp,
		isPresent: next.isPresent,
		statusMessage: laterStatus(
			{
				statusMessage: previous.statusMessage,
				statusUpdatedAt: previousStatusAt,
			},
			next,
		),
		firstJoinedAt: earliest(previous.firstJoinedAt, next.firstJoinedAt),
		// firstJoinedAt 은 더 이른 쪽이 이긴다. 불확실 여부도 그 쪽을 따라간다.
		joinTimeUncertain: earlierWins(
			previous.firstJoinedAt,
			previous.joinTimeUncertain,
			next.firstJoinedAt,
			next.joinTimeUncertain,
		),
		lastOccurredAt:
			next.lastOccurredAt.getTime() >= previous.lastOccurredAt.getTime()
				? next.lastOccurredAt
				: previous.lastOccurredAt,
		// 머문 시간은 구간의 합이므로 그냥 더한다. 공백은 어느 쪽에도 없다.
		onlineSeconds: previous.onlineSeconds + next.onlineSeconds,
		connectionCount: previous.connectionCount + 1,
	};
}

/**
 * 같은 사람으로 묶을 후보인지.
 *
 * 이름만 본다. 예전에는 `이름 + public_ip` 였는데, 네트워크를 옮겨
 * 다시 들어오면 IP 가 바뀌어 한 사람이 두 명으로 쪼개졌다.
 * 누적 접속 시간까지 나뉘어 불꽃 단계가 실제보다 낮게 나왔다.
 *
 * IP 를 뺀다고 동명이인이 뭉치지는 않는다. isContinuation 의
 * **시간 겹침 안전장치**가 남아 있어서, 같은 이름 두 사람이 실제로
 * 같이 있으면 합쳐지지 않는다. 한 사람이 동시에 두 곳에 있을 수 없다.
 *
 * 운영 데이터 9세션 전수 확인: 이름이 같은 2행 이상이 8건, 그중
 * 시간이 겹쳐 동명이인으로 의심되는 경우는 0건이었다.
 *
 * 남는 위험은 동명이인 두 사람이 서로 한 번도 같이 있지 않은 경우뿐이다.
 * 그때는 어드민에서 손으로 떼어낼 수 있어야 한다.
 */
function identityKey(state: ParticipantState): string | null {
	if (!state.displayName) {
		return null;
	}
	return `${state.meetingUuid}|${state.displayName}`;
}

/**
 * 재접속으로 쪼개진 행들을 한 사람으로 합친다.
 *
 * 입력 순서에 의존하지 않는다. 내부에서 시간순으로 정렬한 뒤 처리한다.
 */
export function mergeReconnections(
	rows: readonly ParticipantState[],
): MergedParticipant[] {
	const ordered = [...rows].sort((a, b) => {
		const aStart = (a.firstJoinedAt ?? a.lastOccurredAt).getTime();
		const bStart = (b.firstJoinedAt ?? b.lastOccurredAt).getTime();
		if (aStart !== bStart) return aStart - bStart;
		// 시작 시각이 같으면 결과가 흔들리지 않도록 uuid 로 고정한다
		return a.participantUuid.localeCompare(b.participantUuid);
	});

	const merged: MergedParticipant[] = [];
	/** 합칠 후보를 빠르게 찾기 위한 인덱스. 값은 merged 의 위치다. */
	const openSlot = new Map<string, number>();
	/** 각 merged 항목의 상태 메시지가 언제 적혔는지. 승계 비교에 쓴다. */
	const statusAt: (Date | null)[] = [];

	for (const state of ordered) {
		const key = identityKey(state);

		if (key !== null) {
			const slot = openSlot.get(key);
			if (slot !== undefined) {
				const previous = merged[slot];
				if (previous && isContinuation(previous, state)) {
					const before = statusAt[slot] ?? null;
					merged[slot] = absorb(previous, before, state);
					statusAt[slot] =
						!before ||
						(state.statusUpdatedAt &&
							state.statusUpdatedAt.getTime() >= before.getTime())
							? (state.statusUpdatedAt ?? before)
							: before;
					continue;
				}
			}
		}

		merged.push(toMerged(state));
		statusAt.push(state.statusUpdatedAt);
		if (key !== null) {
			// 같은 키로 다음에 오는 행은 방금 넣은 것과 이어붙일지 판단한다
			openSlot.set(key, merged.length - 1);
		}
	}

	return merged;
}

/**
 * 접속 중인 사람이 앞.
 *
 * 접속 중: 최초 입장순. 오래 있은 사람이 위로 간다.
 * 나감: 최근에 나간 사람순. 방금 나간 사람이 위로 온다 —
 *       돌아올 가능성이 높고, 화면의 "N분 전 퇴장" 이 작은 수부터 늘어선다.
 */
export function sortForDisplay(
	people: readonly MergedParticipant[],
): MergedParticipant[] {
	return [...people].sort((a, b) => {
		if (a.isPresent !== b.isPresent) return a.isPresent ? -1 : 1;

		if (!a.isPresent) return b.lastOccurredAt.getTime() - a.lastOccurredAt.getTime();

		const at = a.firstJoinedAt?.getTime() ?? a.lastOccurredAt.getTime();
		const bt = b.firstJoinedAt?.getTime() ?? b.lastOccurredAt.getTime();
		return at - bt;
	});
}
