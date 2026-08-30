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
