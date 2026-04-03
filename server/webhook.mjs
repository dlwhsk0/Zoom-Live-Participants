import { createHmac } from "node:crypto";
import http from "node:http";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");
const webhookLogPath = resolve(
	process.cwd(),
	process.env.WEBHOOK_LOG_PATH ?? "logs/webhook-events.ndjson",
);

function loadDotEnv() {
	if (!existsSync(ENV_PATH)) {
		return;
	}

	const contents = readFileSync(ENV_PATH, "utf8");

	for (const rawLine of contents.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();

		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

loadDotEnv();

const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? "";
const port = Number(process.env.PORT ?? "3000");
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL ?? "";
const slackNotifyMeetingId = process.env.SLACK_NOTIFY_MEETING_ID ?? "";
const slackNotifyEvents = new Set(
	String(process.env.SLACK_NOTIFY_EVENTS ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean),
);
const slackJoinTemplates = [
	":tada: {name} 용사님 드디어 돌아오셨군요! :crossed_swords: :sparkles:",
	":raised_hands: {name} 님께서 입장하십니다~! :tada: :fire:",
	":boom: {name} 님 등장! 이제 분위기 좀 나겠네요. :fire: :eyes:",
	":rocket: {name} 님 입장 완료. 슬슬 시작해도 되겠습니다. :eyes: :zap:",
	":sparkles: {name} 님 어서 오세요. 오늘도 한 건 해봅시다. :rocket: :muscle:",
	":crown: {name} 님 입장. 오셨군요, 이제 판이 커집니다. :sparkles: :tada:",
	":chefkiss: {name} 님 합류! 이 조합, 제법 맛도리인데요? :fire: :raised_hands:",
	":muscle: {name} 님 들어오셨습니다. 이건 좀 든든한데요. :sparkles: :ok_hand:",
	":boom: {name} 님 등장. 오늘 회의 폼 미쳤다. :fire: :star2:",
	":four_leaf_clover: {name} 님 입장하셨습니다. 이 타이밍, 꽤나 럭키비키잖아. :sparkles: :tada:",
	":raised_hands: {name} 님 합류 완료. 이제 좀 사람 사는 회의 같네요. :sparkles: :house_with_garden:",
	":zap: {name} 님 들어오셨습니다. 시작부터 텐션 좋고. :fire: :microphone:",
	":crown: {name} 님 등장! 다들 집중, 메인 캐릭터 입장하셨습니다. :sparkles: :eyes:",
	":star2: {name} 님 입장. 오늘의 킥, 벌써부터 기대됩니다. :rocket: :tada:",
	":gear: {name} 님 접속 완료. 이 회의 이제 진짜 굴러갑니다. :sparkles: :muscle:",
	":relieved: {name} 님 오셨습니다. 일단 마음이 놓이네요. :sparkles: :raised_hands:",
	":clap: {name} 님 등장. 오늘도 레전드 갱신 각 보입니다. :fire: :trophy:",
	":ok_hand: {name} 님 입장. 이 멤버면 된다, 됩니다. :sparkles: :rocket:",
	":microphone: {name} 님 들어오셨네요. 분위기 바로 살아납니다. :fire: :notes:",
	":chart_with_upwards_trend: {name} 님 합류! 오자마자 신뢰도 +37 상승했습니다. :sparkles: :clap:",
];

const slackLeftTemplates = [
	":eyes: {name} 님 벌써 가세요? :melting_face: :wave:",
	":dash: {name}님 할 일 다 하셨답니다 벌써 들어가신답니다~~ :see_no_evil: :sparkles:",
	":wave: {name} 님 퇴장! 다음 출근 도장도 기대하겠습니다. :calendar: :saluting_face:",
	":thinking_face: {name} 님이 자리를 비웠습니다. 금방 돌아오시려나요? :hourglass_flowing_sand: :eyes:",
	":saluting_face: {name} 님 퇴장 완료. 남은 분들 집중 유지 바랍니다. :muscle: :fire:",
	":cloud: {name} 님 퇴장하셨습니다. 여운이 제법 남는데요. :sparkles: :pensive:",
	":broken_heart: {name} 님 이탈. 방금까지 좋았던 공기, 살짝 아쉽네요. :cloud: :eyes:",
	":leaves: {name} 님 퇴장 완료. 이 또한 흐름이겠죠. :wind_blowing_face: :sparkles:",
	":mute: {name} 님 나가셨습니다. 회의장에 적막이 한 스푼 추가됐습니다. :coffee: :eyes:",
	":pensive: {name} 님 퇴장. 아... 이건 좀 아쉽다. :broken_heart: :dash:",
	":battery: {name} 님 자리 비움. 돌아오시면 다시 텐션 올리겠습니다. :zap: :wave:",
	":man-shrugging: {name} 님 퇴장하셨습니다. 보내드려야죠, 어쩌겠습니까. :coffee: :leaves:",
	":face_with_monocle: {name} 님 나가셨네요. 남은 인원, 정신 바짝 차리시죠. :warning: :muscle:",
	":chart_with_downwards_trend: {name} 님 퇴장. 도파민 살짝 감소했습니다. :melting_face: :chart_with_downwards_trend:",
	":warning: {name} 님 이탈 확인. 회의 난이도 소폭 상승. :fire: :eyes:",
	":muscle: {name} 님 퇴장 완료. 그래도 우린 해냅니다. :shield: :sparkles:",
	":hourglass_flowing_sand: {name} 님 로그아웃급 퇴장. 다음 등장을 기다리겠습니다. :wave: :stars:",
	":melting_face: {name} 님 나가셨습니다. 방금까지 있었던 안정감이 사라졌습니다. :broken_heart: :coffee:",
	":briefcase: {name} 님 퇴장. 그저 갓생을 사러 떠나신 걸로. :sunglasses: :sparkles:",
	":sob: {name} 님 이탈! 이 장면, 살짝 눈물 버튼이네요. :cry: :sparkling_heart:",
	":mega: {name} 님 퇴장하셨습니다. 다음 입장 때 더 크게 환영하겠습니다. :tada: :wave:",
	":cry: {name} 님 퇴장. 현장 체감상 아쉬움 200%입니다. :melting_face: :broken_heart:",
	":coffee: {name} 님 나가셨습니다. 회의방이 갑자기 현실 모드네요. :mute: :eyes:",
	":shield: {name} 님 퇴장 완료. 남은 분들끼리 잘 버텨보겠습니다. :muscle: :fire:",
	":sparkling_heart: {name} 님 이탈. 짧지만 강렬했습니다. :sparkles: :wave:",
];

function sendJson(response, statusCode, body) {
	response.writeHead(statusCode, { "content-type": "application/json" });
	response.end(JSON.stringify(body, null, 2));
}

function sendHtml(response, statusCode, body) {
	response.writeHead(statusCode, {
		"content-type": "text/html; charset=utf-8",
	});
	response.end(body);
}

function appendWebhookLog(entry) {
	mkdirSync(dirname(webhookLogPath), { recursive: true });
	appendFileSync(webhookLogPath, `${JSON.stringify(entry)}\n`);
}

function readWebhookEvents(limit = null) {
	if (!existsSync(webhookLogPath)) {
		return [];
	}

	let lines = readFileSync(webhookLogPath, "utf8")
		.split(/\r?\n/)
		.filter(Boolean);

	if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
		lines = lines.slice(-limit);
	}

	return lines
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return null;
			}
		})
		.filter(Boolean)
		.reverse();
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function deriveRoomContext(entry) {
	const object = entry.raw?.payload?.object ?? {};
	const participant = entry.participant ?? {};
	const leaveReason = String(participant.leave_reason ?? "").toLowerCase();
	const breakout = object.breakout_room ?? participant.breakout_room;

	if (breakout && typeof breakout === "object") {
		return {
			scope: "breakout",
			detail: breakout.name ?? breakout.room_name ?? "breakout",
		};
	}

	if (leaveReason.includes("breakout room")) {
		return {
			scope: "breakout_transition",
			detail: "leave_reason mentions breakout room",
		};
	}

	return {
		scope: "main_or_unknown",
		detail: "payload has no explicit breakout field",
	};
}

function pickRandom(list) {
	if (!Array.isArray(list) || list.length === 0) {
		return "";
	}

	return list[Math.floor(Math.random() * list.length)];
}

function shouldNotifySlack(entry) {
	if (!slackWebhookUrl) {
		return false;
	}

	if (
		slackNotifyMeetingId &&
		String(entry.meeting_id ?? "") !== slackNotifyMeetingId
	) {
		return false;
	}

	if (
		slackNotifyEvents.size > 0 &&
		!slackNotifyEvents.has(String(entry.event ?? ""))
	) {
		return false;
	}

	return true;
}

function buildSlackMessage(entry) {
	const participant = entry.participant ?? {};
	const isJoin = entry.event === "meeting.participant_joined";
	const eventLabel = isJoin ? "입장" : "퇴장";
	const headerTemplate = isJoin
		? pickRandom(slackJoinTemplates)
		: pickRandom(slackLeftTemplates);
	const participantName = participant.user_name ?? "알 수 없음";
	const boldParticipantName = `*${participantName}*`;
	const header = (headerTemplate || `{name} ${eventLabel}`).replaceAll(
		"{name}",
		boldParticipantName,
	);

	return {
		text: `_${header}_`,
	};
}

async function notifySlack(entry) {
	if (!shouldNotifySlack(entry)) {
		return;
	}

	const payload = buildSlackMessage(entry);

	const response = await fetch(slackWebhookUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Slack webhook failed: ${response.status} ${body}`.trim(),
		);
	}
}

function normalizeQueryValue(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function filterWebhookEvents(events, filters) {
	return events.filter((entry) => {
		const room = deriveRoomContext(entry);
		const participantName = entry.participant?.user_name ?? "";

		if (
			filters.event &&
			normalizeQueryValue(entry.event) !== filters.event
		) {
			return false;
		}

		if (
			filters.meetingId &&
			normalizeQueryValue(entry.meeting_id) !== filters.meetingId
		) {
			return false;
		}

		if (
			filters.userName &&
			!normalizeQueryValue(participantName).includes(filters.userName)
		) {
			return false;
		}

		if (
			filters.roomScope &&
			normalizeQueryValue(room.scope) !== filters.roomScope
		) {
			return false;
		}

		return true;
	});
}

function renderEventsPage(events, totalCount, filters) {
	const items = events.length
		? events
				.map((entry) => {
					const participantName = entry.participant?.user_name ?? "-";
					const participantId =
						entry.participant?.user_id ??
						entry.participant?.id ??
						"-";
					const participantUuid =
						entry.participant?.participant_uuid ?? "-";
					const room = deriveRoomContext(entry);

					return `
          <article class="event">
            <div class="meta">
              <strong>${escapeHtml(entry.event ?? "-")}</strong>
              <span>${escapeHtml(entry.received_at ?? "-")}</span>
              <span class="pill">${escapeHtml(room.scope)}</span>
            </div>
            <div>meeting_id: ${escapeHtml(entry.meeting_id ?? "-")}</div>
            <div>meeting_uuid: ${escapeHtml(entry.meeting_uuid ?? "-")}</div>
            <div>participant_name: ${escapeHtml(participantName)}</div>
            <div>participant_id: ${escapeHtml(participantId)}</div>
            <div>participant_uuid: ${escapeHtml(participantUuid)}</div>
            <div>room_context: ${escapeHtml(room.scope)}</div>
            <div>room_detail: ${escapeHtml(room.detail)}</div>
            <details>
              <summary>raw payload</summary>
              <pre>${escapeHtml(JSON.stringify(entry.raw, null, 2))}</pre>
            </details>
          </article>
        `;
				})
				.join("")
		: "<p>아직 수신된 이벤트가 없습니다.</p>";

	return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="3" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zoom Webhook Events</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        padding: 24px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #f4f1ea;
        color: #1e1b16;
      }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 16px; }
      form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin: 0 0 16px;
        background: #fffdf8;
        border: 1px solid #d8d1c3;
        border-radius: 10px;
        padding: 14px;
      }
      label {
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }
      input, select {
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
        border: 1px solid #c9c1b4;
        border-radius: 8px;
        background: #fff;
      }
      .actions {
        display: flex;
        align-items: end;
        gap: 8px;
      }
      .actions a, .actions button {
        display: inline-block;
        border: 1px solid #c9c1b4;
        border-radius: 8px;
        padding: 8px 10px;
        background: #fff;
        color: inherit;
        text-decoration: none;
        cursor: pointer;
      }
      .event {
        background: #fffdf8;
        border: 1px solid #d8d1c3;
        border-radius: 10px;
        padding: 14px;
        margin: 0 0 12px;
      }
      .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .pill {
        border: 1px solid #c9c1b4;
        border-radius: 999px;
        padding: 2px 8px;
        background: #f7f3ea;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #f7f3ea;
        padding: 10px;
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <h1>Zoom Webhook Events</h1>
    <p>저장된 전체 이벤트 ${totalCount}건 중 현재 ${events.length}건을 표시합니다. 3초마다 새로고침됩니다.</p>
    <form method="get" action="/events">
      <div>
        <label for="event">event</label>
        <input id="event" name="event" value="${escapeHtml(filters.event ?? "")}" placeholder="meeting.participant_joined" />
      </div>
      <div>
        <label for="meeting_id">meeting_id</label>
        <input id="meeting_id" name="meeting_id" value="${escapeHtml(filters.meetingId ?? "")}" placeholder="89791995600" />
      </div>
      <div>
        <label for="user_name">user_name</label>
        <input id="user_name" name="user_name" value="${escapeHtml(filters.userName ?? "")}" placeholder="이현호" />
      </div>
      <div>
        <label for="room_scope">room_scope</label>
        <select id="room_scope" name="room_scope">
          <option value="">all</option>
          <option value="main_or_unknown"${filters.roomScope === "main_or_unknown" ? " selected" : ""}>main_or_unknown</option>
          <option value="breakout_transition"${filters.roomScope === "breakout_transition" ? " selected" : ""}>breakout_transition</option>
          <option value="breakout"${filters.roomScope === "breakout" ? " selected" : ""}>breakout</option>
        </select>
      </div>
      <div>
        <label for="limit">limit</label>
        <input id="limit" name="limit" value="${escapeHtml(filters.limit ?? "")}" placeholder="100" />
      </div>
      <div class="actions">
        <button type="submit">apply</button>
        <a href="/events">reset</a>
      </div>
    </form>
    ${items}
  </body>
</html>`;
}

function verifySignature(headers, rawBody) {
	if (!secretToken) {
		return { ok: true, reason: "secret token not configured" };
	}

	const signature = headers["x-zm-signature"];
	const timestamp = headers["x-zm-request-timestamp"];

	if (!signature || !timestamp) {
		return { ok: false, reason: "missing signature headers" };
	}

	const message = `v0:${timestamp}:${rawBody}`;
	const expected = `v0=${createHmac("sha256", secretToken).update(message).digest("hex")}`;

	return {
		ok: signature === expected,
		reason: signature === expected ? "verified" : "signature mismatch",
	};
}

const server = http.createServer((request, response) => {
	const requestUrl = new URL(
		request.url ?? "/",
		`http://${request.headers.host ?? "localhost"}`,
	);

	if (request.method === "GET" && requestUrl.pathname === "/health") {
		sendJson(response, 200, { ok: true });
		return;
	}

	if (request.method === "GET" && requestUrl.pathname === "/events") {
		const limitParam = requestUrl.searchParams.get("limit");
		const limit = limitParam ? Number(limitParam) : null;
		const allEvents = readWebhookEvents();
		const filteredEvents = filterWebhookEvents(readWebhookEvents(limit), {
			event: normalizeQueryValue(requestUrl.searchParams.get("event")),
			meetingId: normalizeQueryValue(
				requestUrl.searchParams.get("meeting_id"),
			),
			userName: normalizeQueryValue(
				requestUrl.searchParams.get("user_name"),
			),
			roomScope: normalizeQueryValue(
				requestUrl.searchParams.get("room_scope"),
			),
		});
		sendHtml(
			response,
			200,
			renderEventsPage(filteredEvents, allEvents.length, {
				event: requestUrl.searchParams.get("event") ?? "",
				meetingId: requestUrl.searchParams.get("meeting_id") ?? "",
				userName: requestUrl.searchParams.get("user_name") ?? "",
				roomScope: requestUrl.searchParams.get("room_scope") ?? "",
				limit: requestUrl.searchParams.get("limit") ?? "",
			}),
		);
		return;
	}

	if (request.method === "GET" && requestUrl.pathname === "/events.json") {
		const limitParam = requestUrl.searchParams.get("limit");
		const limit = limitParam ? Number(limitParam) : null;
		const allEvents = readWebhookEvents();
		const events = filterWebhookEvents(readWebhookEvents(limit), {
			event: normalizeQueryValue(requestUrl.searchParams.get("event")),
			meetingId: normalizeQueryValue(
				requestUrl.searchParams.get("meeting_id"),
			),
			userName: normalizeQueryValue(
				requestUrl.searchParams.get("user_name"),
			),
			roomScope: normalizeQueryValue(
				requestUrl.searchParams.get("room_scope"),
			),
		}).map((entry) => ({
			...entry,
			room_context: deriveRoomContext(entry),
		}));
		sendJson(response, 200, {
			ok: true,
			total: allEvents.length,
			filtered: events.length,
			events,
		});
		return;
	}

	if (request.method !== "POST" || requestUrl.pathname !== "/webhook") {
		sendJson(response, 404, { ok: false, message: "Not found" });
		return;
	}

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

		const verification = verifySignature(request.headers, rawBody);
		if (!verification.ok) {
			sendJson(response, 401, {
				ok: false,
				message: verification.reason,
			});
			return;
		}

		if (body.event === "endpoint.url_validation") {
			if (!secretToken) {
				sendJson(response, 500, {
					ok: false,
					message:
						"ZOOM_WEBHOOK_SECRET_TOKEN is required for endpoint validation",
				});
				return;
			}

			const plainToken = body.payload?.plainToken;
			const encryptedToken = createHmac("sha256", secretToken)
				.update(plainToken)
				.digest("hex");

			sendJson(response, 200, {
				plainToken,
				encryptedToken,
			});
			return;
		}

		const entry = {
			received_at: new Date().toISOString(),
			event: body.event,
			meeting_id: body.payload?.object?.id,
			meeting_uuid: body.payload?.object?.uuid,
			participant: body.payload?.object?.participant,
			raw: body,
		};

		appendWebhookLog(entry);

		console.log("\n[webhook event]");
		console.log(JSON.stringify(entry, null, 2));

		notifySlack(entry).catch((error) => {
			console.error("\n[slack notify failed]");
			console.error(error.message);
		});

		sendJson(response, 200, { ok: true });
	});
});

server.listen(port, () => {
	console.log(`Webhook server listening on http://localhost:${port}/webhook`);
});
