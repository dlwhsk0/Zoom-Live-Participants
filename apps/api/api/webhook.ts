import { getEnv } from "../src/config/env.ts";
import { getDb } from "../src/db/client.ts";
import { handleWebhook } from "../src/webhook/handle.ts";

export const config = { runtime: "nodejs" } as const;

function toHeaderRecord(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		out[key.toLowerCase()] = value;
	});
	return out;
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export default async function handler(request: Request): Promise<Response> {
	if (request.method !== "POST") {
		return json(405, { ok: false, reason: "method not allowed" });
	}

	// 서명은 원문 바이트 기준이므로 파싱 전에 문자열로 받아야 한다.
	const rawBody = await request.text();

	try {
		const result = await handleWebhook({
			db: getDb(),
			secretToken: getEnv().ZOOM_WEBHOOK_SECRET_TOKEN,
			headers: toHeaderRecord(request.headers),
			rawBody,
		});

		return json(result.status, result.body);
	} catch (error) {
		console.error("[webhook] failed", error);
		// Zoom 재전송을 유발하지 않도록 500 대신 200 을 줄 수도 있으나,
		// 저장 실패는 재전송으로 복구되는 편이 낫다.
		return json(500, { ok: false, reason: "internal error" });
	}
}
