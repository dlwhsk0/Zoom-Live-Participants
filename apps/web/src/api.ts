export interface SessionParticipant {
	participantUuid: string;
	displayName: string | null;
	firstJoinedAt: string | null;
	/** 현재 접속 중인지 */
	isPresent: boolean;
	/** 마지막 이벤트 시각. 퇴장자의 경우 나간 시각이다. */
	lastOccurredAt: string;
	/** 몇 번 접속했는지. 1보다 크면 재접속했거나 기기가 여럿이다. */
	connectionCount: number;
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
export const STATUS_MAX_LENGTH = 50;

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

/**
 * 조회 API 공유 토큰. 서버의 ACCESS_TOKEN 과 같은 값이다.
 *
 * 빌드에 박혀 나가므로 감추는 값이 아니다. **번들을 받을 수 있는 사람에게만
 * 주는 값**이다 — 사이트가 공용 비밀번호 뒤에 있으면 토큰을 얻으려면 먼저
 * 그 문을 통과해야 한다. 사이트를 잠그지 않으면 이 토큰도 같이 공개된다.
 *
 * 비어 있으면 헤더를 붙이지 않는다. 서버도 비어 있으면 검사하지 않는다.
 */
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN ?? "";

/** 우리 API 로 나가는 요청의 공통 헤더. */
function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return ACCESS_TOKEN
		? { ...extra, "x-access-token": ACCESS_TOKEN }
		: { ...extra };
}

export async function fetchPresence(): Promise<PresenceSnapshot> {
	const url = new URL(`${API_BASE}/api/participants`, window.location.origin);
	if (MEETING_ID) {
		url.searchParams.set("meeting_id", MEETING_ID);
	}

	const response = await fetch(url, {
		headers: apiHeaders({ accept: "application/json" }),
	});

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
		headers: apiHeaders({ "content-type": "application/json" }),
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
	cursor?: string | null;
	raw: boolean;
	limit?: number;
}): Promise<LogPage> {
	const url = new URL(`${API_BASE}/api/logs`, window.location.origin);
	url.searchParams.set("limit", String(params.limit ?? 50));
	if (params.raw) url.searchParams.set("raw", "1");
	if (params.cursor) url.searchParams.set("cursor", params.cursor);
	if (MEETING_ID) url.searchParams.set("meeting_id", MEETING_ID);

	const response = await fetch(url, {
		headers: { accept: "application/json" },
		credentials: "include",
	});

	return readOrThrow<LogPage>(response);
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

function adminUrl(path: string): URL {
	const url = new URL(`${API_BASE}${path}`, window.location.origin);
	if (MEETING_ID) url.searchParams.set("meeting_id", MEETING_ID);
	return url;
}

/**
 * 어드민 요청 공통.
 *
 * 세션 쿠키로 인증한다. 화면과 API 가 다른 도메인이라 credentials 를
 * 명시해야 쿠키가 실린다 — 기본값은 실지 않는다.
 */
function adminInit(init: RequestInit = {}): RequestInit {
	return {
		...init,
		headers: apiHeaders((init.headers as Record<string, string>) ?? {}),
		credentials: "include",
	};
}

async function readOrThrow<T>(response: Response): Promise<T> {
	if (response.status === 401) {
		throw new Error("로그인이 필요합니다");
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
export async function fetchIdentities(): Promise<IdentityList> {
	const response = await fetch(
		adminUrl("/api/admin/identities"),
		adminInit({ headers: { accept: "application/json" } }),
	);
	return readOrThrow<IdentityList>(response);
}

/**
 * 고른 행의 이름을 하나로 맞춘다.
 *
 * 합치기와 떼어내기가 같은 동작이다. 병합이 이름으로만 판단하므로
 * 이름을 같게 하면 합쳐지고 다르게 하면 떨어진다.
 */
export async function renameIdentities(params: {
	meetingUuid: string;
	participantUuids: string[];
	displayName: string;
}): Promise<{ changed: number }> {
	const response = await fetch(
		adminUrl("/api/admin/rename"),
		adminInit({
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				meetingUuid: params.meetingUuid,
				participantUuids: params.participantUuids,
				displayName: params.displayName,
			}),
		}),
	);
	return readOrThrow<{ changed: number }>(response);
}

export async function fetchAdminActions(): Promise<AdminAction[]> {
	const response = await fetch(
		adminUrl("/api/admin/actions"),
		adminInit({ headers: { accept: "application/json" } }),
	);
	const body = await readOrThrow<{ actions: AdminAction[] }>(response);
	return body.actions;
}

export async function undoAdminAction(params: {
	actionId: string;
}): Promise<{ restored: number }> {
	const response = await fetch(
		adminUrl("/api/admin/undo"),
		adminInit({
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ actionId: params.actionId }),
		}),
	);
	return readOrThrow<{ restored: number }>(response);
}

export interface NameAlias {
	alias: string;
	canonical: string;
	createdAt: string;
}

export async function fetchAliases(): Promise<NameAlias[]> {
	const response = await fetch(
		adminUrl("/api/admin/aliases"),
		adminInit({ headers: { accept: "application/json" } }),
	);
	const body = await readOrThrow<{ aliases: NameAlias[] }>(response);
	return body.aliases;
}

/** 고정 닉네임을 대표 이름에 잇는다. 예: Chloe → 이도경. */
export async function putAlias(params: {
	alias: string;
	canonical: string;
}): Promise<{ ok: boolean }> {
	const response = await fetch(
		adminUrl("/api/admin/aliases"),
		adminInit({
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ alias: params.alias, canonical: params.canonical }),
		}),
	);
	return readOrThrow<{ ok: boolean }>(response);
}

export async function deleteAlias(params: {
	alias: string;
}): Promise<{ ok: boolean }> {
	const url = adminUrl("/api/admin/aliases");
	url.searchParams.set("alias", params.alias);
	const response = await fetch(url, adminInit({ method: "DELETE" }));
	return readOrThrow<{ ok: boolean }>(response);
}

// ── 로그인 ──────────────────────────────────

export interface AuthUser {
	username: string;
	role: string;
}

/**
 * 지금 로그인돼 있는가.
 *
 * 로그인하지 않은 상태는 오류가 아니라 정상이다. 401 이면 null 을 준다.
 */
export async function fetchMe(): Promise<AuthUser | null> {
	const response = await fetch(
		adminUrl("/api/auth/me"),
		adminInit({ headers: { accept: "application/json" } }),
	);

	if (response.status === 401) return null;

	const body = await readOrThrow<{ user: AuthUser }>(response);
	return body.user;
}

export async function login(params: {
	username: string;
	password: string;
}): Promise<AuthUser> {
	const response = await fetch(
		adminUrl("/api/auth/login"),
		adminInit({
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(params),
		}),
	);

	// 401 은 "아이디나 비번이 틀렸다" 이지 "로그인이 필요하다" 가 아니다.
	// readOrThrow 의 문구를 쓰면 엉뚱한 말이 나온다.
	if (response.status === 401 || response.status === 429) {
		const body = (await response.json().catch(() => null)) as
			| { reason?: string }
			| null;
		throw new Error(body?.reason ?? "로그인하지 못했습니다");
	}

	const body = await readOrThrow<{ user: AuthUser }>(response);
	return body.user;
}

export async function logout(): Promise<void> {
	await fetch(adminUrl("/api/auth/logout"), adminInit({ method: "POST" }));
}

// ── 통계 ───────────────────────────────────

export interface DayBucket {
	/** YYYY-MM-DD (한국 시간) */
	date: string;
	people: number;
	seconds: number;
	/** 그 순간 가장 많이 모였던 인원 */
	peak: number;
	/** 그날 가장 먼저 들어온 / 마지막으로 나간 시각. HH:MM */
	firstAt: string | null;
	lastAt: string | null;
}

export interface HourBucket {
	hour: number;
	seconds: number;
}

export interface WeekdayBucket {
	weekday: number;
	seconds: number;
	days: number;
}

export interface PersonStat {
	displayName: string;
	seconds: number;
	days: number;
	/** 최근 연속 출석일 */
	streak: number;
	/** 끊기지 않고 이어지는 중인가. false 면 "N일 연속" 이라 부르면 안 된다 */
	streakAlive: boolean;
	bestStreak: number;
	daily: { date: string; seconds: number }[];
}

export interface WeekComparison {
	recent: { seconds: number; people: number };
	previous: { seconds: number; people: number };
}

export interface Stats {
	from: string;
	to: string;
	days: DayBucket[];
	hours: HourBucket[];
	weekdays: WeekdayBucket[];
	people: PersonStat[];
	week: WeekComparison;
	/** 보통 몇 시에 시작해서 몇 시에 끝나는가 (HH:MM) */
	typicalStart: string | null;
	typicalEnd: string | null;
	totalSeconds: number;
	totalPeople: number;
}

export async function fetchStats(days: number): Promise<Stats> {
	const url = new URL(`${API_BASE}/api/stats`, window.location.origin);
	url.searchParams.set("days", String(days));

	const response = await fetch(url, {
		headers: apiHeaders({ accept: "application/json" }),
	});

	if (!response.ok) {
		throw new Error(`요청 실패 (${response.status})`);
	}

	return (await response.json()) as Stats;
}
