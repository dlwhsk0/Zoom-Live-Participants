/**
 * Zoom REST API 클라이언트. 놓친 입퇴장을 메꾸는 데 필요한 것만 둔다.
 *
 * Server-to-Server OAuth 다. 토큰은 1시간짜리라 만료 1분 전까지 재사용한다.
 *
 * 쓰는 것은 두 가지다.
 *   GET /past_meetings/{meetingId}/instances        끝난 세션 목록
 *   GET /report/meetings/{uuid}/participants         세션의 접속 구간 목록
 *
 * 진행 중인 세션은 instances 에 나오지 않는다. 끝나야 올라온다 —
 * docs/time-and-gaps.md "놓친 데이터를 되찾는 방법".
 */

export interface ZoomCredentials {
	accountId: string;
	clientId: string;
	clientSecret: string;
}

export interface PastInstance {
	uuid: string;
	startTime: Date;
}

/**
 * Report API 의 한 줄. **접속 구간 하나**다.
 *
 * 소회의실을 옮기면 구간이 끊겨 새 줄이 된다 — 앞 줄의 leave_time 과 다음 줄의
 * join_time 이 같다. participant_uuid 는 없고 user_id 가 구간마다 새로 붙는다.
 * 웹훅의 participant.user_id 와 같은 값이다.
 */
export interface ReportRecord {
	userId: string;
	name: string | null;
	joinTime: Date;
	leaveTime: Date | null;
	/** 원문. 백필한 이벤트의 출처로 남긴다. user_email 은 뺀다. */
	raw: Record<string, unknown>;
}

export interface ZoomReportClient {
	listPastInstances(meetingId: string): Promise<PastInstance[]>;
	listReportParticipants(meetingUuid: string): Promise<ReportRecord[]>;
}

// 생성자 파라미터 프로퍼티는 쓰지 않는다. --experimental-strip-types 가 못 지운다.
export class ZoomApiError extends Error {
	readonly status: number;
	readonly code: number | null;

	constructor(status: number, code: number | null, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

/** 환경변수에서 자격증명을 꺼낸다. 하나라도 비면 null — 배치를 끈다. */
export function zoomCredentialsFrom(env: {
	ZOOM_ACCOUNT_ID: string;
	ZOOM_CLIENT_ID: string;
	ZOOM_CLIENT_SECRET: string;
}): ZoomCredentials | null {
	if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
		return null;
	}
	return {
		accountId: env.ZOOM_ACCOUNT_ID,
		clientId: env.ZOOM_CLIENT_ID,
		clientSecret: env.ZOOM_CLIENT_SECRET,
	};
}

/**
 * 세션 uuid 를 경로에 넣는다.
 *
 * `/` 로 시작하거나 `//` 를 품은 uuid 는 **두 번** 인코딩해야 한다는 것이
 * Zoom 의 규칙이다. 한 번만 하면 404 가 난다.
 */
export function encodeMeetingUuid(uuid: string): string {
	const once = encodeURIComponent(uuid);
	return uuid.startsWith("/") || uuid.includes("//")
		? encodeURIComponent(once)
		: once;
}

function parseTime(raw: unknown): Date | null {
	if (typeof raw !== "string" || !raw) return null;
	const at = new Date(raw);
	return Number.isNaN(at.getTime()) ? null : at;
}

export function createZoomReportClient(
	credentials: ZoomCredentials,
	fetchImpl: typeof fetch = fetch,
): ZoomReportClient {
	let token: string | null = null;
	let expiresAt = 0;

	async function getToken(): Promise<string> {
		if (token && Date.now() < expiresAt - 60_000) return token;

		const basic = Buffer.from(
			`${credentials.clientId}:${credentials.clientSecret}`,
		).toString("base64");
		const response = await fetchImpl(
			`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(credentials.accountId)}`,
			{ method: "POST", headers: { authorization: `Basic ${basic}` } },
		);
		const body = (await response.json().catch(() => ({}))) as {
			access_token?: string;
			expires_in?: number;
			reason?: string;
		};

		if (!response.ok || !body.access_token) {
			throw new ZoomApiError(
				response.status,
				null,
				`Zoom 토큰 발급 실패: ${body.reason ?? response.status}`,
			);
		}

		token = body.access_token;
		expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
		return token;
	}

	async function get<T>(path: string): Promise<T> {
		const response = await fetchImpl(`https://api.zoom.us/v2${path}`, {
			headers: { authorization: `Bearer ${await getToken()}` },
		});
		const body = (await response.json().catch(() => ({}))) as T & {
			code?: number;
			message?: string;
		};

		if (!response.ok) {
			throw new ZoomApiError(
				response.status,
				typeof body.code === "number" ? body.code : null,
				`Zoom ${path} → ${response.status} ${body.message ?? ""}`.trim(),
			);
		}
		return body;
	}

	return {
		async listPastInstances(meetingId) {
			const body = await get<{
				meetings?: { uuid?: string; start_time?: string }[];
			}>(`/past_meetings/${encodeURIComponent(meetingId)}/instances`);

			return (body.meetings ?? []).flatMap((meeting) => {
				const startTime = parseTime(meeting.start_time);
				return meeting.uuid && startTime
					? [{ uuid: meeting.uuid, startTime }]
					: [];
			});
		},

		async listReportParticipants(meetingUuid) {
			const records: ReportRecord[] = [];
			let nextPageToken = "";

			do {
				const query = new URLSearchParams({ page_size: "300" });
				if (nextPageToken) query.set("next_page_token", nextPageToken);

				const body = await get<{
					participants?: Record<string, unknown>[];
					next_page_token?: string;
				}>(
					`/report/meetings/${encodeMeetingUuid(meetingUuid)}/participants?${query}`,
				);

				for (const row of body.participants ?? []) {
					const joinTime = parseTime(row.join_time);
					const userId = row.user_id;
					if (!joinTime || (typeof userId !== "string" && typeof userId !== "number")) {
						continue;
					}

					// 웹훅에는 없던 값이다. 원장에 개인정보를 새로 들이지 않는다.
					const { user_email: _email, ...raw } = row;

					records.push({
						userId: String(userId),
						name: typeof row.name === "string" && row.name ? row.name : null,
						joinTime,
						leaveTime: parseTime(row.leave_time),
						raw,
					});
				}

				nextPageToken = body.next_page_token ?? "";
			} while (nextPageToken);

			return records;
		},
	};
}
