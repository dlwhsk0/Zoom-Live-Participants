import { createServer, type Server } from "node:http";
import { z } from "zod";

import { getEnv } from "../config/env.ts";
import { closeDb, getDb } from "../db/client.ts";
import {
	httpRequests,
	presenceQueryDuration,
	statusUpdates,
	webhookDuration,
} from "../metrics.ts";
import {
	deleteAlias,
	listAdminActions,
	listAliases,
	listIdentities,
	putAlias,
	renameParticipants,
	undoAction,
} from "../repository/admin.ts";
import { setStatusMessage } from "../repository/ingest.ts";
import { findUserByUsername, touchLastLogin } from "../repository/users.ts";
import {
	findCurrentSession,
	getLogs,
	getPresenceSnapshot,
} from "../repository/query.ts";
import { getDayDetail, getStats } from "../repository/stats.ts";
import { handleWebhook } from "../webhook/handle.ts";
import { SOURCE_FINGERPRINT, STARTED_AT } from "../version.ts";
import { clientIpFrom } from "./client-ip.ts";
import { corsHeaders } from "./cors.ts";
import { canAttempt, clearAttempts, recordFailure } from "./login-throttle.ts";
import { verifyPassword } from "./password.ts";
import {
	buildSessionCookie,
	cookieFrom,
	createSessionValue,
	readSessionValue,
	SESSION_COOKIE,
} from "./session.ts";
import { accessAllowed } from "./access.ts";
import { bearerFrom, tokensMatch } from "./token.ts";

/** 한 줄에 들어가야 하므로 길이를 제한한다. */
export const STATUS_MAX_LENGTH = 50;

/**
 * 없는 아이디로 로그인해도 있는 아이디와 같은 시간이 걸리게 하려고 쓴다.
 * 이 값에 해당하는 비밀번호는 아무도 모른다 — 맞을 일이 없다.
 */
const DUMMY_PASSWORD_HASH =
	"scrypt$16384$8$1$rMmKy5YlFWN1goAVGka+Fg==$LAtikmkbvDe7B39stCjI7dl9zKTfzCgGi8TQvP5XuZM3UMGQpmebBNGh1sG4PMYvV6vw/s47gvAaunvY2oFAsA==";

const statusBodySchema = z.object({
	message: z
		.string()
		.max(STATUS_MAX_LENGTH, `상태 메시지는 ${STATUS_MAX_LENGTH}자 이하로 적어주세요`),
});

/** 어드민이 사람을 합치거나 떼어낼 때 보내는 것. */
const renameSchema = z.object({
	meetingUuid: z.string().min(1),
	participantUuids: z.array(z.string().min(1)).min(1, "행을 하나 이상 고르세요"),
	displayName: z
		.string()
		.trim()
		.min(1, "이름을 비울 수 없습니다")
		.max(80, "이름이 너무 깁니다"),
});

const loginSchema = z.object({
	username: z.string().trim().min(1, "아이디를 입력하세요").max(80),
	password: z.string().min(1, "비밀번호를 입력하세요").max(200),
});

const undoSchema = z.object({
	actionId: z.string().uuid(),
});

/** 고정 닉네임을 대표 이름에 잇는다. 예: Chloe → 이도경. */
const aliasSchema = z.object({
	alias: z.string().trim().min(1).max(80),
	canonical: z.string().trim().min(1).max(80),
});

/**
 * 경로를 메트릭 라벨로 쓸 수 있게 정규화한다.
 *
 * participant_uuid 를 그대로 라벨에 넣으면 시계열이 참가자 수만큼 늘어난다.
 */
function normalizeRoute(pathname: string): string {
	if (/^\/api\/participants\/[^/]+\/status$/.test(pathname)) {
		return "/api/participants/:uuid/status";
	}
	if (pathname.startsWith("/api/") || pathname.startsWith("/health")) {
		return pathname;
	}
	return "other";
}

interface Reply {
	status: number;
	body: unknown;
	headers?: Record<string, string>;
	/** JSON 이 아닌 본문. robots.txt 처럼 그대로 내보낼 때 쓴다. */
	raw?: string;
}

function toHeaderRecord(
	headers: NodeJS.Dict<string | string[]>,
): Record<string, string | string[] | undefined> {
	const out: Record<string, string | string[] | undefined> = {};
	for (const [key, value] of Object.entries(headers)) {
		out[key.toLowerCase()] = value;
	}
	return out;
}

/** 웹훅을 한 줄로 요약해 남긴다. 실제 회의 검증 중에 눈으로 따라가기 위한 것. */
function logWebhook(rawBody: string, status: number, result: unknown): void {
	const time = new Date().toISOString();

	let body: {
		event?: string;
		payload?: { object?: { participant?: Record<string, string> } };
	};
	try {
		body = JSON.parse(rawBody);
	} catch {
		console.log(`${time} [${status}] 파싱 불가 본문 ${rawBody.length}자`);
		return;
	}

	const event = (body.event ?? "?").replace("meeting.", "");
	const p = body.payload?.object?.participant;
	const outcome = JSON.stringify(result);

	if (!p) {
		console.log(`${time} [${status}] ${event} ${outcome}`);
		return;
	}

	const when = p.join_time ?? p.leave_time ?? "";
	const reason = p.leave_reason
		? ` reason="${p.leave_reason.replace(/^.*Reason : /, "")}"`
		: "";

	console.log(
		`${time} [${status}] ${event} name="${p.user_name ?? "?"}"` +
			` uid=${p.user_id ?? "?"} puuid=${p.participant_uuid ?? "?"}` +
			` at=${when}${reason} ${outcome}`,
	);
}

/**
 * 로그·어드민 화면의 열쇠.
 *
 * 참가자 이름과 IP 를 그대로 다루는 곳이라 토큰 없이는 열지 않는다.
 * 쿼리스트링과 Authorization 헤더 둘 다 받는다. 브라우저에서 링크로
 * 여는 것도, curl 로 부르는 것도 되어야 한다.
 */
function checkToken(
	query: URLSearchParams,
	headers: Record<string, string | string[] | undefined>,
): Reply | null {
	const token = getEnv().LOGS_TOKEN;

	if (!token) {
		return {
			status: 503,
			body: { ok: false, reason: "LOGS_TOKEN 이 설정되지 않았습니다" },
		};
	}

	const provided = query.get("key") ?? bearerFrom(headers.authorization);

	if (!tokensMatch(provided, token)) {
		return { status: 401, body: { ok: false, reason: "unauthorized" } };
	}

	return null;
}

/**
 * 공개 조회 API 의 문지기.
 *
 * 웹훅(Zoom 이 부른다)과 헬스체크(컨테이너가 부른다)에는 걸지 않는다.
 * 어드민 쪽은 이미 세션이나 토큰으로 막혀 있다.
 */
function deniedByAccessToken(
	headers: Record<string, string | string[] | undefined>,
): Reply | null {
	if (accessAllowed(getEnv().ACCESS_TOKEN, headers)) return null;

	return { status: 401, body: { ok: false, reason: "unauthorized" } };
}

/** 요청에 실려 온 로그인 세션. 없거나 서명이 틀리면 null. */
function sessionFrom(headers: Record<string, string | string[] | undefined>) {
	return readSessionValue(
		cookieFrom(headers.cookie, SESSION_COOKIE),
		getEnv().SESSION_SECRET,
	);
}

/**
 * 어드민 화면을 열 자격이 있는가.
 *
 * 로그인 세션이 먼저다. LOGS_TOKEN 은 세션이 없던 시절의 방식이고,
 * 아직 쓰는 곳이 있어 남겨 둔다 — 계정으로 옮겨간 뒤에 걷어낸다.
 */
function checkAdmin(
	query: URLSearchParams,
	headers: Record<string, string | string[] | undefined>,
): Reply | null {
	if (sessionFrom(headers)?.role === "admin") return null;

	return checkToken(query, headers);
}

/** 어드민이 다루는 회의방. 지정이 없으면 환경변수의 방을 쓴다. */
function resolveMeetingId(query: URLSearchParams): string {
	return query.get("meeting_id")?.trim() || getEnv().ZOOM_MEETING_ID || "";
}

async function route(
	rawMethod: string,
	path: string,
	query: URLSearchParams,
	headers: Record<string, string | string[] | undefined>,
	rawBody: string,
): Promise<Reply> {
	// HEAD 는 본문 없는 GET 이다. 라우팅은 같이 받고, 본문은 Node 가 알아서 뺀다.
	// 이게 없으면 HEAD /robots.txt 가 404 라 크롤러가 파일이 없다고 볼 수 있다.
	const method = rawMethod === "HEAD" ? "GET" : rawMethod;

	/**
	 * 검색엔진 차단.
	 *
	 * 조회 API 는 인증 없이 참가자 실명을 내준다. JSON 응답도 색인 대상이라
	 * 화면 쪽만 막아서는 부족하다. 이 도메인 전체를 크롤링 대상에서 뺀다.
	 *
	 * 팻말이지 잠금장치가 아니다 — 지키는 크롤러에만 통한다.
	 */
	if (method === "GET" && path === "/robots.txt") {
		return {
			status: 200,
			body: null,
			raw: "User-agent: *\nDisallow: /\n",
			headers: { "content-type": "text/plain; charset=utf-8" },
		};
	}

	// 컨테이너 헬스체크용. DB 를 건드리지 않는다.
	// version 은 실행 중인 소스의 지문이다. 배포 반영 여부를 이걸로 확인한다.
	if (method === "GET" && path === "/health") {
		return {
			status: 200,
			body: {
				ok: true,
				version: SOURCE_FINGERPRINT,
				startedAt: STARTED_AT,
			},
		};
	}

	// DB 까지 살아있는지 확인한다. 배포 직후 점검용.
	if (method === "GET" && path === "/health/db") {
		try {
			await getPresenceSnapshot(getDb(), "__healthcheck__");
			return { status: 200, body: { ok: true, db: "reachable" } };
		} catch (error) {
			console.error("[health/db]", error);
			return { status: 503, body: { ok: false, db: "unreachable" } };
		}
	}

	if (method === "GET" && path === "/api/participants") {
		const denied = deniedByAccessToken(headers);
		if (denied) return denied;

		const meetingId =
			query.get("meeting_id")?.trim() || getEnv().ZOOM_MEETING_ID || "";

		if (!meetingId) {
			return {
				status: 400,
				body: { ok: false, reason: "meeting_id is required (or set ZOOM_MEETING_ID)" },
			};
		}

		const stop = presenceQueryDuration.startTimer();
		const snapshot = await getPresenceSnapshot(
			getDb(),
			meetingId,
			clientIpFrom(headers),
		);
		stop();

		// 폴링이므로 캐시하면 안 된다
		return { status: 200, body: snapshot, headers: { "cache-control": "no-store" } };
	}

	// PUT /api/participants/:participantUuid/status
	const statusMatch = path.match(/^\/api\/participants\/([^/]+)\/status$/);
	if (statusMatch && (method === "PUT" || method === "POST")) {
		const denied = deniedByAccessToken(headers);
		if (denied) return denied;

		const participantUuid = decodeURIComponent(statusMatch[1] ?? "");

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody || "{}");
		} catch {
			return { status: 400, body: { ok: false, reason: "invalid json" } };
		}

		const result = statusBodySchema.safeParse(parsed);
		if (!result.success) {
			return {
				status: 400,
				body: {
					ok: false,
					reason: result.error.issues[0]?.message ?? "invalid body",
				},
			};
		}

		const meetingId =
			query.get("meeting_id")?.trim() || getEnv().ZOOM_MEETING_ID || "";
		const session = await findCurrentSession(getDb(), meetingId);

		if (!session) {
			return { status: 404, body: { ok: false, reason: "no active session" } };
		}

		// 빈 문자열은 상태 지우기로 본다
		const message = result.data.message.trim() || null;
		// 이 엔드포인트는 인증이 없다. 막는 대신 누가 바꿨는지 남긴다.
		const updated = await setStatusMessage(
			getDb(),
			session.meetingUuid,
			participantUuid,
			message,
			clientIpFrom(headers),
		);

		if (!updated) {
			return { status: 404, body: { ok: false, reason: "participant not found" } };
		}

		statusUpdates.inc({ action: message ? "set" : "clear" });
		return { status: 200, body: { ok: true, statusMessage: message } };
	}

	/**
	 * 최근 며칠의 통계.
	 *
	 * 조회와 같은 문지기를 쓴다. 사람 이름이 들어 있으므로 참가자 목록과
	 * 같은 등급으로 다룬다.
	 */
	if (method === "GET" && path === "/api/stats") {
		const denied = deniedByAccessToken(headers);
		if (denied) return denied;

		// 너무 긴 기간을 요구하면 서버만 힘들다. 화면에서도 그만큼은 못 그린다.
		const requested = Number(query.get("days") ?? 14);
		const days = Number.isFinite(requested)
			? Math.min(Math.max(Math.trunc(requested), 1), 90)
			: 14;

		const stats = await getStats(getDb(), days);

		return {
			status: 200,
			body: stats,
			headers: { "cache-control": "no-store" },
		};
	}

	/**
	 * 하루치 참가자 목록.
	 *
	 * 통계가 아니라 그날의 화면이다. 조회와 같은 문지기를 쓴다.
	 */
	if (method === "GET" && path === "/api/day") {
		const denied = deniedByAccessToken(headers);
		if (denied) return denied;

		const date = query.get("date")?.trim() ?? "";

		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return {
				status: 400,
				body: { ok: false, reason: "date 는 YYYY-MM-DD 여야 합니다" },
			};
		}

		return {
			status: 200,
			body: await getDayDetail(getDb(), date),
			headers: { "cache-control": "no-store" },
		};
	}

	// ── 로그인 ──────────────────────────────────

	/**
	 * 로그인.
	 *
	 * 화면에 가입은 없다. 계정은 scripts/create-user.ts 로만 만든다.
	 * 아이디가 없는 경우에도 해시를 한 번 돌린다 — 응답 시간으로
	 * "그 아이디는 있다/없다" 를 알아낼 수 있으면 안 된다.
	 */
	if (method === "POST" && path === "/api/auth/login") {
		if (!getEnv().SESSION_SECRET) {
			return {
				status: 503,
				body: { ok: false, reason: "로그인이 설정되지 않았습니다" },
			};
		}

		const ip = clientIpFrom(headers) ?? "unknown";

		if (!canAttempt(ip)) {
			return {
				status: 429,
				body: { ok: false, reason: "시도가 너무 많습니다. 잠시 뒤에 다시 하세요" },
			};
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody || "{}");
		} catch {
			return { status: 400, body: { ok: false, reason: "본문이 JSON 이 아닙니다" } };
		}

		const input = loginSchema.safeParse(parsed);
		if (!input.success) {
			return {
				status: 400,
				body: { ok: false, reason: input.error.issues[0]?.message ?? "잘못된 요청입니다" },
			};
		}

		const user = await findUserByUsername(getDb(), input.data.username);
		const matched = await verifyPassword(
			input.data.password,
			user?.passwordHash ?? DUMMY_PASSWORD_HASH,
		);

		if (!user || !matched) {
			recordFailure(ip);
			// 어느 쪽이 틀렸는지 알려주지 않는다
			return {
				status: 401,
				body: { ok: false, reason: "아이디 또는 비밀번호가 맞지 않습니다" },
			};
		}

		clearAttempts(ip);
		await touchLastLogin(getDb(), user.id);

		const value = createSessionValue(
			{ sub: user.id, username: user.username, role: user.role },
			getEnv().SESSION_SECRET,
		);

		return {
			status: 200,
			body: { ok: true, user: { username: user.username, role: user.role } },
			headers: {
				"set-cookie": buildSessionCookie(value),
				"cache-control": "no-store",
			},
		};
	}

	if (method === "POST" && path === "/api/auth/logout") {
		return {
			status: 200,
			body: { ok: true },
			headers: {
				"set-cookie": buildSessionCookie(null),
				"cache-control": "no-store",
			},
		};
	}

	/** 화면이 "지금 로그인돼 있나" 를 묻는 곳. */
	if (method === "GET" && path === "/api/auth/me") {
		const session = sessionFrom(headers);

		if (!session) {
			return {
				status: 401,
				body: { ok: false, reason: "로그인이 필요합니다" },
				headers: { "cache-control": "no-store" },
			};
		}

		return {
			status: 200,
			body: {
				ok: true,
				user: { username: session.username, role: session.role },
			},
			headers: { "cache-control": "no-store" },
		};
	}

	// 로그는 참가자 이름과 IP 를 그대로 담는다. 토큰 없이는 열지 않는다.
	if (method === "GET" && path === "/api/logs") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		const meetingId = resolveMeetingId(query);

		if (!meetingId) {
			return {
				status: 400,
				body: { ok: false, reason: "meeting_id is required (or set ZOOM_MEETING_ID)" },
			};
		}

		const page = await getLogs(getDb(), meetingId, {
			limit: Number(query.get("limit") ?? 50),
			cursor: query.get("cursor"),
			raw: query.get("raw") === "1",
		});

		return { status: 200, body: page, headers: { "cache-control": "no-store" } };
	}

	// ── 어드민 ──────────────────────────────────
	// 사람을 합치고 떼어내는 곳. 로그와 같은 토큰으로 막는다.

	if (method === "GET" && path === "/api/admin/identities") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		const meetingId = resolveMeetingId(query);
		if (!meetingId) {
			return {
				status: 400,
				body: { ok: false, reason: "meeting_id is required (or set ZOOM_MEETING_ID)" },
			};
		}

		const result = await listIdentities(getDb(), meetingId);
		return {
			status: 200,
			body: result,
			headers: { "cache-control": "no-store" },
		};
	}

	/**
	 * 고른 행의 이름을 하나로 맞춘다.
	 *
	 * 합치기와 떼어내기가 같은 동작이다. 병합이 이름으로만 판단하므로
	 * 이름을 같게 하면 합쳐지고 다르게 하면 떨어진다.
	 */
	if (method === "POST" && path === "/api/admin/rename") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody || "{}");
		} catch {
			return { status: 400, body: { ok: false, reason: "본문이 JSON 이 아닙니다" } };
		}

		const input = renameSchema.safeParse(parsed);
		if (!input.success) {
			return {
				status: 400,
				body: {
					ok: false,
					reason: input.error.issues[0]?.message ?? "잘못된 요청입니다",
				},
			};
		}

		const result = await renameParticipants(getDb(), {
			meetingUuid: input.data.meetingUuid,
			participantUuids: input.data.participantUuids,
			displayName: input.data.displayName,
			clientIp: clientIpFrom(headers),
		});

		if (result.changed === 0) {
			return { status: 404, body: { ok: false, reason: "대상 행을 찾지 못했습니다" } };
		}

		return { status: 200, body: { ok: true, ...result } };
	}

	if (method === "GET" && path === "/api/admin/actions") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		const actions = await listAdminActions(getDb(), Number(query.get("limit") ?? 50));
		return {
			status: 200,
			body: { actions },
			headers: { "cache-control": "no-store" },
		};
	}

	if (method === "POST" && path === "/api/admin/undo") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody || "{}");
		} catch {
			return { status: 400, body: { ok: false, reason: "본문이 JSON 이 아닙니다" } };
		}

		const input = undoSchema.safeParse(parsed);
		if (!input.success) {
			return { status: 400, body: { ok: false, reason: "잘못된 요청입니다" } };
		}

		const result = await undoAction(
			getDb(),
			input.data.actionId,
			clientIpFrom(headers),
		);

		return { status: result.ok ? 200 : 400, body: result };
	}

	if (method === "GET" && path === "/api/admin/aliases") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		const aliases = await listAliases(getDb());
		return {
			status: 200,
			body: { aliases },
			headers: { "cache-control": "no-store" },
		};
	}

	if (method === "POST" && path === "/api/admin/aliases") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody || "{}");
		} catch {
			return { status: 400, body: { ok: false, reason: "본문이 JSON 이 아닙니다" } };
		}

		const input = aliasSchema.safeParse(parsed);
		if (!input.success) {
			return {
				status: 400,
				body: {
					ok: false,
					reason: input.error.issues[0]?.message ?? "잘못된 요청입니다",
				},
			};
		}

		const result = await putAlias(getDb(), {
			alias: input.data.alias,
			canonical: input.data.canonical,
			clientIp: clientIpFrom(headers),
		});

		return { status: result.ok ? 200 : 400, body: result };
	}

	if (method === "DELETE" && path === "/api/admin/aliases") {
		const denied = checkAdmin(query, headers);
		if (denied) return denied;

		const alias = query.get("alias")?.trim();
		if (!alias) {
			return { status: 400, body: { ok: false, reason: "alias 가 필요합니다" } };
		}

		return { status: 200, body: await deleteAlias(getDb(), alias, clientIpFrom(headers)) };
	}

	if (method === "POST" && path === "/api/webhook") {
		const stop = webhookDuration.startTimer();
		const result = await handleWebhook({
			db: getDb(),
			secretToken: getEnv().ZOOM_WEBHOOK_SECRET_TOKEN,
			headers,
			rawBody,
		});
		stop();
		logWebhook(rawBody, result.status, result.body);
		return { status: result.status, body: result.body };
	}

	return { status: 404, body: { ok: false, reason: "not found" } };
}

export function createApiServer(): Server {
	return createServer((req, res) => {
		let rawBody = "";
		req.setEncoding("utf8");
		req.on("data", (chunk) => {
			rawBody += chunk;
		});

		req.on("end", async () => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const cors = corsHeaders(
				typeof req.headers.origin === "string" ? req.headers.origin : null,
			);

			// 프리플라이트
			if (req.method === "OPTIONS") {
				res.writeHead(204, cors);
				res.end();
				return;
			}

			try {
				const reply = await route(
					req.method ?? "GET",
					url.pathname,
					url.searchParams,
					toHeaderRecord(req.headers),
					rawBody,
				);

				httpRequests.inc({
					route: normalizeRoute(url.pathname),
					status: String(reply.status),
				});

				res.writeHead(reply.status, {
					"content-type": "application/json; charset=utf-8",
					// robots.txt 를 거치지 않고 URL 로 바로 온 크롤러까지 막는다
					"x-robots-tag": "noindex, nofollow",
					...cors,
					...reply.headers,
				});
				res.end(reply.raw ?? JSON.stringify(reply.body));
			} catch (error) {
				console.error("[unhandled]", error);
				res.writeHead(500, {
					"content-type": "application/json; charset=utf-8",
					"x-robots-tag": "noindex, nofollow",
					...cors,
				});
				res.end(JSON.stringify({ ok: false, reason: "internal error" }));
			}
		});
	});
}

/** 컨테이너가 SIGTERM 을 보내면 진행 중인 요청을 마치고 커넥션을 닫는다. */
export function installShutdownHandlers(server: Server): void {
	let closing = false;

	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.on(signal, () => {
			if (closing) return;
			closing = true;
			console.log(`[${signal}] 종료 시작`);

			server.close(() => {
				closeDb()
					.catch((error) => console.error("[shutdown] db", error))
					.finally(() => process.exit(0));
			});

			// 요청이 안 끝나도 일정 시간 뒤에는 내려간다
			setTimeout(() => process.exit(0), 10_000).unref();
		});
	}
}
