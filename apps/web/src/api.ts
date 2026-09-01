export interface SessionParticipant {
	participantUuid: string;
	displayName: string | null;
	firstJoinedAt: string | null;
	/** 현재 접속 중인지 */
	isPresent: boolean;
	/** 마지막 이벤트 시각. 퇴장자의 경우 나간 시각이다. */
	lastOccurredAt: string;
	/**
	 * 이 세션에서 실제로 머문 시간의 합(초). 진행 중인 구간까지 포함한다.
	 *
	 * 나갔다 온 공백은 빠지고, 여러 기기로 동시에 접속한 겹친 구간은
	 * 한 번만 센다. 서버가 끝까지 계산해서 준다 — 겹침을 눌러야 하므로
	 * 화면에서 진행 중인 구간을 더하는 방식으로는 맞출 수 없다.
	 */
	onlineSeconds: number;
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

/** 타일 한 칸에 들어가야 하므로 길이를 제한한다. 서버와 같은 값이다. */
export const STATUS_MAX_LENGTH = 30;

export interface PresenceSnapshot {
	meetingId: string;
	meetingUuid: string | null;
	/** 현재 접속 중인 인원 */
	count: number;
	/** 이 세션에 한 번이라도 들어온 총 인원 */
	totalCount: number;
	/** 이 회의 세션이 시작된 시각. Zoom 이 모든 웹훅에 실어 보내는 값이다. */
	startedAt: string | null;
	/** startedAt 이 추정값인가. true 면 실제 시작보다 늦은 값이다. */
	startedAtEstimated: boolean;
	/** 회의를 연 사람. 시작 시각에 처음 들어온 사람을 못 봤으면 null. */
	openedBy: string | null;
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
	/** 이 시각에 같은 사람의 다른 접속이 살아 있었는가. 노트북 + 폰 같은 경우다. */
	isConcurrent: boolean;
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

// ── 어드민 ──────────────────────────────────

export interface Identity {
	participantUuid: string;
	displayName: string | null;
	publicIp: string | null;
	isPresent: boolean;
	firstJoinedAt: string | null;
	lastOccurredAt: string;
}

export interface IdentityList {
	meetingUuid: string | null;
	identities: Identity[];
}

export interface AdminAction {
	id: string;
	createdAt: string;
	action: string;
	meetingUuid: string | null;
	detail: {
		after?: string;
		targets?: { participantUuid: string; before: string | null }[];
		undid?: string;
		restored?: { participantUuid: string; before: string | null }[];
		alias?: string;
		canonical?: string;
	};
	clientIp: string | null;
}

function adminUrl(path: string, key: string): URL {
	const url = new URL(`${API_BASE}${path}`, window.location.origin);
	url.searchParams.set("key", key);
	if (MEETING_ID) url.searchParams.set("meeting_id", MEETING_ID);
	return url;
}

async function readOrThrow<T>(response: Response): Promise<T> {
	if (response.status === 401) {
		throw new Error("접근 키가 올바르지 않습니다");
	}

	const body = (await response.json().catch(() => null)) as
		| (T & { reason?: string })
		| null;

	if (!response.ok) {
		throw new Error(body?.reason ?? `요청 실패 (${response.status})`);
	}

	if (body === null) throw new Error("응답을 읽지 못했습니다");
	return body;
}

/** 합치기 전의 원본 행. 어느 행을 고칠지 고르려면 이쪽을 봐야 한다. */
export async function fetchIdentities(key: string): Promise<IdentityList> {
	const response = await fetch(adminUrl("/api/admin/identities", key), {
		headers: { accept: "application/json" },
	});
	return readOrThrow<IdentityList>(response);
}

/**
 * 고른 행의 이름을 하나로 맞춘다.
 *
 * 합치기와 떼어내기가 같은 동작이다. 병합이 이름으로만 판단하므로
 * 이름을 같게 하면 합쳐지고 다르게 하면 떨어진다.
 */
export async function renameIdentities(params: {
	key: string;
	meetingUuid: string;
	participantUuids: string[];
	displayName: string;
}): Promise<{ changed: number }> {
	const response = await fetch(adminUrl("/api/admin/rename", params.key), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			meetingUuid: params.meetingUuid,
			participantUuids: params.participantUuids,
			displayName: params.displayName,
		}),
	});
	return readOrThrow<{ changed: number }>(response);
}

export async function fetchAdminActions(key: string): Promise<AdminAction[]> {
	const response = await fetch(adminUrl("/api/admin/actions", key), {
		headers: { accept: "application/json" },
	});
	const body = await readOrThrow<{ actions: AdminAction[] }>(response);
	return body.actions;
}

export async function undoAdminAction(params: {
	key: string;
	actionId: string;
}): Promise<{ restored: number }> {
	const response = await fetch(adminUrl("/api/admin/undo", params.key), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ actionId: params.actionId }),
	});
	return readOrThrow<{ restored: number }>(response);
}

export interface NameAlias {
	alias: string;
	canonical: string;
	createdAt: string;
}

export async function fetchAliases(key: string): Promise<NameAlias[]> {
	const response = await fetch(adminUrl("/api/admin/aliases", key), {
		headers: { accept: "application/json" },
	});
	const body = await readOrThrow<{ aliases: NameAlias[] }>(response);
	return body.aliases;
}

/** 고정 닉네임을 대표 이름에 잇는다. 예: Chloe → 이도경. */
export async function putAlias(params: {
	key: string;
	alias: string;
	canonical: string;
}): Promise<{ ok: boolean }> {
	const response = await fetch(adminUrl("/api/admin/aliases", params.key), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ alias: params.alias, canonical: params.canonical }),
	});
	return readOrThrow<{ ok: boolean }>(response);
}

export async function deleteAlias(params: {
	key: string;
	alias: string;
}): Promise<{ ok: boolean }> {
	const url = adminUrl("/api/admin/aliases", params.key);
	url.searchParams.set("alias", params.alias);
	const response = await fetch(url, { method: "DELETE" });
	return readOrThrow<{ ok: boolean }>(response);
}
