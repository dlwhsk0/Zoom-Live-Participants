export interface PresentParticipant {
	participantUuid: string;
	displayName: string | null;
	firstJoinedAt: string | null;
}

export interface PresenceSnapshot {
	meetingId: string;
	meetingUuid: string | null;
	count: number;
	updatedAt: string | null;
	participants: PresentParticipant[];
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
