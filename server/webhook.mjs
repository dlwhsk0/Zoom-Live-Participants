import { createHmac } from "node:crypto";
import http from "node:http";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");
const webhookLogPath = resolve(process.cwd(), process.env.WEBHOOK_LOG_PATH ?? "logs/webhook-events.ndjson");

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

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body, null, 2));
}

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
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

function renderEventsPage(events, totalCount) {
  const items = events.length
    ? events.map((entry) => {
        const participantName = entry.participant?.user_name ?? "-";
        const participantId = entry.participant?.user_id ?? entry.participant?.id ?? "-";

        return `
          <article class="event">
            <div class="meta">
              <strong>${escapeHtml(entry.event ?? "-")}</strong>
              <span>${escapeHtml(entry.received_at ?? "-")}</span>
            </div>
            <div>meeting_id: ${escapeHtml(entry.meeting_id ?? "-")}</div>
            <div>meeting_uuid: ${escapeHtml(entry.meeting_uuid ?? "-")}</div>
            <div>participant_name: ${escapeHtml(participantName)}</div>
            <div>participant_id: ${escapeHtml(participantId)}</div>
            <details>
              <summary>raw payload</summary>
              <pre>${escapeHtml(JSON.stringify(entry.raw, null, 2))}</pre>
            </details>
          </article>
        `;
      }).join("")
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
    reason: signature === expected ? "verified" : "signature mismatch"
  };
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/events") {
    const limitParam = requestUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : null;
    const allEvents = readWebhookEvents();
    const events = readWebhookEvents(limit);
    sendHtml(response, 200, renderEventsPage(events, allEvents.length));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/events.json") {
    const limitParam = requestUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : null;
    const allEvents = readWebhookEvents();
    const events = readWebhookEvents(limit);
    sendJson(response, 200, { ok: true, total: allEvents.length, events });
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
      sendJson(response, 401, { ok: false, message: verification.reason });
      return;
    }

    if (body.event === "endpoint.url_validation") {
      if (!secretToken) {
        sendJson(response, 500, {
          ok: false,
          message: "ZOOM_WEBHOOK_SECRET_TOKEN is required for endpoint validation"
        });
        return;
      }

      const plainToken = body.payload?.plainToken;
      const encryptedToken = createHmac("sha256", secretToken).update(plainToken).digest("hex");

      sendJson(response, 200, {
        plainToken,
        encryptedToken
      });
      return;
    }

    const entry = {
      received_at: new Date().toISOString(),
      event: body.event,
      meeting_id: body.payload?.object?.id,
      meeting_uuid: body.payload?.object?.uuid,
      participant: body.payload?.object?.participant,
      raw: body
    };

    appendWebhookLog(entry);

    console.log("\n[webhook event]");
    console.log(JSON.stringify(entry, null, 2));

    sendJson(response, 200, { ok: true });
  });
});

server.listen(port, () => {
  console.log(`Webhook server listening on http://localhost:${port}/webhook`);
});
