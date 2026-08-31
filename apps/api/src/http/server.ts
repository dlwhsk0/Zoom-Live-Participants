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
import { setStatusMessage } from "../repository/ingest.ts";
import {
	findCurrentSession,
	getLogs,
	getPresenceSnapshot,
} from "../repository/query.ts";
import { handleWebhook } from "../webhook/handle.ts";
import { SOURCE_FINGERPRINT, STARTED_AT } from "../version.ts";
import { clientIpFrom } from "./client-ip.ts";
import { corsHeaders } from "./cors.ts";

/** 한 줄에 들어가야 하므로 길이를 제한한다. */
export const STATUS_MAX_LENGTH = 20;

const statusBodySchema = z.object({
	message: z
		.string()
		.max(STATUS_MAX_LENGTH, `상태 메시지는 ${STATUS_MAX_LENGTH}자 이하로 적어주세요`),
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

async function route(
	method: string,
	path: string,
	query: URLSearchParams,
	headers: Record<string, string | string[] | undefined>,
	rawBody: string,
): Promise<Reply> {
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
		const updated = await setStatusMessage(
			getDb(),
			session.meetingUuid,
			participantUuid,
			message,
		);

		if (!updated) {
			return { status: 404, body: { ok: false, reason: "participant not found" } };
		}

		statusUpdates.inc({ action: message ? "set" : "clear" });
		return { status: 200, body: { ok: true, statusMessage: message } };
	}

	// 로그는 참가자 이름과 IP 를 그대로 담는다. 토큰 없이는 열지 않는다.
	if (method === "GET" && path === "/api/logs") {
		const token = getEnv().LOGS_TOKEN;

		if (!token) {
			return {
				status: 503,
				body: { ok: false, reason: "LOGS_TOKEN 이 설정되지 않았습니다" },
			};
		}

		const provided =
			query.get("key") ??
			(headers.authorization === `Bearer ${token}` ? token : null);

		if (provided !== token) {
			return { status: 401, body: { ok: false, reason: "unauthorized" } };
		}

		const meetingId =
			query.get("meeting_id")?.trim() || getEnv().ZOOM_MEETING_ID || "";

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
					...cors,
					...reply.headers,
				});
				res.end(JSON.stringify(reply.body));
			} catch (error) {
				console.error("[unhandled]", error);
				res.writeHead(500, {
					"content-type": "application/json; charset=utf-8",
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
