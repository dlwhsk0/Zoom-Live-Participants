import { getEnv } from "../src/config/env.ts";
import { getDb } from "../src/db/client.ts";
import { getPresenceSnapshot } from "../src/repository/query.ts";

export const config = { runtime: "nodejs" } as const;

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			// 폴링이므로 캐시를 두면 안 된다
			"cache-control": "no-store",
			"access-control-allow-origin": "*",
		},
	});
}

export default async function handler(request: Request): Promise<Response> {
	if (request.method !== "GET") {
		return json(405, { ok: false, reason: "method not allowed" });
	}

	const url = new URL(request.url);
	const meetingId =
		url.searchParams.get("meeting_id")?.trim() ||
		getEnv().ZOOM_MEETING_ID ||
		"";

	if (!meetingId) {
		return json(400, {
			ok: false,
			reason: "meeting_id is required (or set ZOOM_MEETING_ID)",
		});
	}

	try {
		const snapshot = await getPresenceSnapshot(getDb(), meetingId);
		return json(200, snapshot);
	} catch (error) {
		console.error("[participants] failed", error);
		return json(500, { ok: false, reason: "internal error" });
	}
}
