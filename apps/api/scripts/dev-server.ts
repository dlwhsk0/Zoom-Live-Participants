/**
 * 로컬 개발 서버.
 *
 * Vercel Functions 는 배포 시 api/*.ts 를 각각의 엔드포인트로 띄운다.
 * 로컬에서는 같은 핸들러를 하나의 http 서버에 연결해 동일하게 동작시킨다.
 */
import { createServer } from "node:http";

import participantsHandler from "../api/participants.ts";
import webhookHandler from "../api/webhook.ts";

const PORT = Number(process.env.PORT ?? 3000);

/** 들어온 웹훅을 한 줄로 요약한다. 실제 회의 검증 중에 눈으로 따라가기 위한 것. */
function logWebhook(rawBody: string, status: number, result: unknown): void {
	const time = new Date().toTimeString().slice(0, 8);

	let body: {
		event?: string;
		payload?: { object?: { participant?: Record<string, string> } };
	};
	try {
		body = JSON.parse(rawBody);
	} catch {
		console.log(`${time}  [${status}] 파싱 불가 본문 ${rawBody.length}자`);
		return;
	}

	const event = (body.event ?? "?").replace("meeting.", "");
	const p = body.payload?.object?.participant;
	const outcome = JSON.stringify(result);

	if (!p) {
		console.log(`${time}  [${status}] ${event}  ${outcome}`);
		return;
	}

	const when = p.join_time ?? p.leave_time ?? "";
	const reason = p.leave_reason
		? `  reason="${p.leave_reason.replace(/^.*Reason : /, "")}"`
		: "";

	console.log(
		`${time}  [${status}] ${event.padEnd(20)} ${(p.user_name ?? "?").padEnd(12)}` +
			` uid=${(p.user_id ?? "?").padEnd(9)} at=${when}${reason}`,
	);
	console.log(`         puuid=${p.participant_uuid ?? "?"}  ${outcome}`);
}

function toRequest(
	method: string,
	url: string,
	headers: Record<string, string | string[] | undefined>,
	body: string,
): Request {
	const init: RequestInit = { method, headers: {} };
	const h = new Headers();
	for (const [key, value] of Object.entries(headers)) {
		if (typeof value === "string") h.set(key, value);
	}
	init.headers = h;
	if (method !== "GET" && method !== "HEAD") init.body = body;
	return new Request(new URL(url, `http://localhost:${PORT}`), init);
}

const server = createServer((req, res) => {
	let body = "";
	req.setEncoding("utf8");
	req.on("data", (chunk) => {
		body += chunk;
	});
	req.on("end", async () => {
		const path = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;
		const handler =
			path === "/api/webhook"
				? webhookHandler
				: path === "/api/participants"
					? participantsHandler
					: null;

		if (!handler) {
			res.writeHead(404, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: false, reason: "not found" }));
			return;
		}

		try {
			const response = await handler(
				toRequest(req.method ?? "GET", req.url ?? "/", req.headers, body),
			);
			const text = await response.text();

			if (path === "/api/webhook") {
				let parsed: unknown = text;
				try {
					parsed = JSON.parse(text);
				} catch {
					// 그대로 둔다
				}
				logWebhook(body, response.status, parsed);
			}
			const headers: Record<string, string> = {};
			response.headers.forEach((v, k) => {
				headers[k] = v;
			});
			res.writeHead(response.status, headers);
			res.end(text);
		} catch (error) {
			console.error(error);
			res.writeHead(500, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: false, reason: "internal error" }));
		}
	});
});

server.listen(PORT, () => {
	console.log(`api on http://localhost:${PORT}`);
	console.log(`  GET  /api/participants`);
	console.log(`  POST /api/webhook`);
	console.log("");
	console.log("웹훅이 들어오면 아래에 한 줄씩 찍힙니다.");
	console.log("전체 요청 본문은 ngrok 인스펙터(http://localhost:4040)에서 볼 수 있습니다.");
	console.log("");
});
