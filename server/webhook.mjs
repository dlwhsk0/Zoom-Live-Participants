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

function appendWebhookLog(entry) {
  mkdirSync(dirname(webhookLogPath), { recursive: true });
  appendFileSync(webhookLogPath, `${JSON.stringify(entry)}\n`);
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
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "POST" || request.url !== "/webhook") {
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
