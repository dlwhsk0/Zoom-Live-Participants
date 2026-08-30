export interface SessionParticipant {
	participantUuid: string;
	displayName: string | null;
	firstJoinedAt: string | null;
	/** 현재 접속 중인지 */
	isPresent: boolean;
	/** 마지막 이벤트 시각. 퇴장자의 경우 나간 시각이다. */
	lastOccurredAt: string;
	/** 참가자가 적은 상태 메시지 */
	statusMessage: string | null;
	/**
	 * 입장 시각을 믿을 수 없는가. 서버가 꺼져 있어 입장 이벤트를 놓친 경우다.
	 * true 면 경과 시간 대신 "접속 시각 불명" 을 보여준다.
	 */
	joinTimeUncertain: boolean;
	/**
	 * 내 브라우저 IP 와 이 참가자의 Zoom 접속 IP 가 같은가.
	 * 권한이 아니라 힌트다. 맞으면 확인창을 건너뛴다.
	 */
	isYou: boolean;
}

/** 한 줄에 들어가야 하므로 길이를 제한한다. 서버와 같은 값이다. */
export const STATUS_MAX_LENGTH = 60;

export interface PresenceSnapshot {
	meetingId: string;
	meetingUuid: string | null;
	/** 현재 접속 중인 인원 */
	count: number;
	/** 이 세션에 한 번이라도 들어온 총 인원 */
	totalCount: number;
	updatedAt: string | null;
	participants: SessionParticipant[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const MEETING_ID = import.meta.env.VITE_MEETING_ID ?? "";

export async function fetchPresence(): Promise<PresenceSnapshot> {
	const url = new URL(`${API_BASE}/api/participants`, window.location.origin);
	if (MEETING_ID) {
		url.searchParams.set("meeting_id", MEETING_ID);
	}

	const response = await fetch(url, { headers: { accept: "application/json" } });

	if (!response.ok) {
		throw new Error(`요청 실패 (${response.status})`);
	}

	return (await response.json()) as PresenceSnapshot;
}

export async function saveStatusMessage(
	participantUuid: string,
	message: string,
): Promise<string | null> {
	const url = new URL(
		`${API_BASE}/api/participants/${encodeURIComponent(participantUuid)}/status`,
		window.location.origin,
	);
	if (MEETING_ID) {
		url.searchParams.set("meeting_id", MEETING_ID);
	}

	const response = await fetch(url, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ message }),
	});

	const body = (await response.json().catch(() => null)) as
		| { ok?: boolean; statusMessage?: string | null; reason?: string }
		| null;

	if (!response.ok || !body?.ok) {
		throw new Error(body?.reason ?? `저장 실패 (${response.status})`);
	}

	return body.statusMessage ?? null;
}

export interface LogEntry {
	id: string;
	occurredAt: string;
	receivedAt: string;
	eventType: string;
	displayName: string | null;
	participantUuid: string;
	userId: string | null;
	publicIp: string | null;
	leaveReason: string | null;
	/** 같은 참가자·같은 발생 시각에 반대 이벤트가 있으면 소회의실 이동이다. */
	isRoomMove: boolean;
	payload?: unknown;
}

export interface LogPage {
	meetingId: string;
	meetingUuid: string | null;
	entries: LogEntry[];
	nextCursor: string | null;
}

export async function fetchLogs(params: {
	key: string;
	cursor?: string | null;
	raw: boolean;
	limit?: number;
}): Promise<LogPage> {
	const url = new URL(`${API_BASE}/api/logs`, window.location.origin);
	url.searchParams.set("key", params.key);
	url.searchParams.set("limit", String(params.limit ?? 50));
	if (params.raw) url.searchParams.set("raw", "1");
	if (params.cursor) url.searchParams.set("cursor", params.cursor);
	if (MEETING_ID) url.searchParams.set("meeting_id", MEETING_ID);

	const response = await fetch(url, { headers: { accept: "application/json" } });

	if (response.status === 401) {
		throw new Error("접근 키가 올바르지 않습니다");
	}
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as
			| { reason?: string }
			| null;
		throw new Error(body?.reason ?? `요청 실패 (${response.status})`);
	}

	return (await response.json()) as LogPage;
}
