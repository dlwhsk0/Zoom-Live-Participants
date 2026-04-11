import http from "node:http";

import { appConfig } from "./config.mjs";
import { filterWebhookEvents, normalizeQueryValue, renderEventsPage } from "./events-view.mjs";
import { sendHtml, sendJson } from "./http-response.mjs";
import { appendWebhookLog, readWebhookEvents } from "./log-store.mjs";
import { deriveRoomContext } from "./room-context.mjs";
import { deleteSlackMessage } from "./slack-api.mjs";
import { notifySlack } from "./slack-notifier.mjs";
import { buildEndpointValidation, verifySignature } from "./signature.mjs";

function buildWebhookEntry(body) {
	return {
		received_at: new Date().toISOString(),
		event: body.event,
		meeting_id: body.payload?.object?.id,
		meeting_uuid: body.payload?.object?.uuid,
		participant: body.payload?.object?.participant,
		raw: body,
	};
}

function parseEventFilters(requestUrl) {
	return {
		event: normalizeQueryValue(requestUrl.searchParams.get("event")),
		meetingId: normalizeQueryValue(requestUrl.searchParams.get("meeting_id")),
		userName: normalizeQueryValue(requestUrl.searchParams.get("user_name")),
		roomScope: normalizeQueryValue(requestUrl.searchParams.get("room_scope")),
	};
}

function parseEventFormState(requestUrl) {
	return {
		event: requestUrl.searchParams.get("event") ?? "",
		meetingId: requestUrl.searchParams.get("meeting_id") ?? "",
		userName: requestUrl.searchParams.get("user_name") ?? "",
		roomScope: requestUrl.searchParams.get("room_scope") ?? "",
		limit: requestUrl.searchParams.get("limit") ?? "",
	};
}

function handleHealth(response) {
	sendJson(response, 200, { ok: true });
}

function handleEventsPage(requestUrl, response) {
	const limitParam = requestUrl.searchParams.get("limit");
	const limit = limitParam ? Number(limitParam) : null;
	const allEvents = readWebhookEvents(appConfig.webhookLogPath);
	const pageEvents =
		typeof limit === "number" && Number.isFinite(limit) && limit > 0
			? allEvents.slice(0, limit)
			: allEvents;
	const filteredEvents = filterWebhookEvents(
		pageEvents,
		parseEventFilters(requestUrl),
		allEvents,
	);

	sendHtml(
		response,
		200,
		renderEventsPage(
			filteredEvents,
			allEvents.length,
			parseEventFormState(requestUrl),
			allEvents,
		),
	);
}

function handleEventsJson(requestUrl, response) {
	const limitParam = requestUrl.searchParams.get("limit");
	const limit = limitParam ? Number(limitParam) : null;
	const allEvents = readWebhookEvents(appConfig.webhookLogPath);
	const pageEvents =
		typeof limit === "number" && Number.isFinite(limit) && limit > 0
			? allEvents.slice(0, limit)
			: allEvents;
	const events = filterWebhookEvents(
		pageEvents,
		parseEventFilters(requestUrl),
		allEvents,
	).map((entry) => ({
		...entry,
		room_context: deriveRoomContext(entry, allEvents),
	}));

	sendJson(response, 200, {
		ok: true,
		total: allEvents.length,
		filtered: events.length,
		events,
	});
}

function readJsonBody(request) {
	return new Promise((resolve, reject) => {
		let rawBody = "";

		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			rawBody += chunk;
		});

		request.on("end", () => {
			try {
				resolve(rawBody ? JSON.parse(rawBody) : {});
			} catch {
				reject(new Error("Invalid JSON"));
			}
		});

		request.on("error", reject);
	});
}

function verifyAdminApiKey(request) {
	if (!appConfig.slackAdminApiKey) {
		return {
			ok: false,
			statusCode: 503,
			message: "SLACK_ADMIN_API_KEY is required",
		};
	}

	if (request.headers["x-admin-api-key"] !== appConfig.slackAdminApiKey) {
		return {
			ok: false,
			statusCode: 401,
			message: "invalid admin api key",
		};
	}

	return { ok: true };
}

async function handleSlackMessageDelete(request, response) {
	const adminCheck = verifyAdminApiKey(request);
	if (!adminCheck.ok) {
		sendJson(response, adminCheck.statusCode, {
			ok: false,
			message: adminCheck.message,
		});
		return;
	}

	let body;

	try {
		body = await readJsonBody(request);
	} catch (error) {
		sendJson(response, 400, {
			ok: false,
			message: error.message,
		});
		return;
	}

	const channel = String(body.channel ?? "").trim();
	const ts = String(body.ts ?? "").trim();

	if (!channel || !ts) {
		sendJson(response, 400, {
			ok: false,
			message: "channel and ts are required",
		});
		return;
	}

	try {
		const result = await deleteSlackMessage({ channel, ts });
		sendJson(response, 200, {
			ok: true,
			channel: result.channel,
			ts: result.ts,
		});
	} catch (error) {
		sendJson(response, 502, {
			ok: false,
			message: error.message,
		});
	}
}

function handleWebhookRequest(request, response) {
	let rawBody = "";

	request.setEncoding("utf8");
	request.on("data", (chunk) => {
		rawBody += chunk;
	});

	request.on("end", () => {
		let body;

		try {
			body = rawBody ? JSON.parse(rawBody) : {};
		} catch {
			sendJson(response, 400, { ok: false, message: "Invalid JSON" });
			return;
		}

		const verification = verifySignature(
			appConfig.secretToken,
			request.headers,
			rawBody,
		);

		if (!verification.ok) {
			sendJson(response, 401, {
				ok: false,
				message: verification.reason,
			});
			return;
		}

		if (body.event === "endpoint.url_validation") {
			if (!appConfig.secretToken) {
				sendJson(response, 500, {
					ok: false,
					message:
						"ZOOM_WEBHOOK_SECRET_TOKEN is required for endpoint validation",
				});
				return;
			}

			sendJson(
				response,
				200,
				buildEndpointValidation(appConfig.secretToken, body.payload?.plainToken),
			);
			return;
		}

		const entry = buildWebhookEntry(body);

		appendWebhookLog(appConfig.webhookLogPath, entry);

		console.log("\n[webhook event]");
		console.log(JSON.stringify(entry, null, 2));

		notifySlack(entry).catch((error) => {
			console.error("\n[slack notify failed]");
			console.error(error.message);
		});

		sendJson(response, 200, { ok: true });
	});
}

export function createWebhookServer() {
	return http.createServer((request, response) => {
		const requestUrl = new URL(
			request.url ?? "/",
			`http://${request.headers.host ?? "localhost"}`,
		);

		if (request.method === "GET" && requestUrl.pathname === "/health") {
			handleHealth(response);
			return;
		}

		if (request.method === "GET" && requestUrl.pathname === "/events") {
			handleEventsPage(requestUrl, response);
			return;
		}

		if (request.method === "GET" && requestUrl.pathname === "/events.json") {
			handleEventsJson(requestUrl, response);
			return;
		}

		if (
			request.method === "POST" &&
			requestUrl.pathname === "/slack/messages/delete"
		) {
			handleSlackMessageDelete(request, response);
			return;
		}

		if (request.method !== "POST" || requestUrl.pathname !== "/webhook") {
			sendJson(response, 404, { ok: false, message: "Not found" });
			return;
		}

		handleWebhookRequest(request, response);
	});
}
