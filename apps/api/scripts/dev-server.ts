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
});
