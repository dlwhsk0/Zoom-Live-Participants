import { createHmac } from "node:crypto";
import "./lib/zoom.mjs";

const event = process.argv[2] ?? "meeting.participant_joined";
const meetingId = process.env.ZOOM_MEETING_ID ?? "2498511381";
const meetingUuid = "local-test-uuid";
const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? "";
const port = Number(process.env.PORT ?? "3000");
const webhookUrl = process.env.ZOOM_WEBHOOK_LOCAL_URL ?? `http://127.0.0.1:${port}/webhook`;

if (!secretToken) {
  throw new Error("Missing required environment variable: ZOOM_WEBHOOK_SECRET_TOKEN");
}

function buildBody(targetEvent) {
  if (targetEvent === "endpoint.url_validation") {
    return {
      event: targetEvent,
      payload: {
        plainToken: "plain-token-test"
      }
    };
  }

  const participant = {
    id: "participant-local-1",
    user_id: "user-local-1",
    user_name: "Local Test User",
    email: "local-test@example.com"
  };

  return {
    event: targetEvent,
    payload: {
      account_id: "local-test-account",
      object: {
        id: meetingId,
        uuid: meetingUuid,
        host_id: "host-local-1",
        topic: "Local Webhook Test",
        participant
      }
    }
  };
}

const body = JSON.stringify(buildBody(event));
const timestamp = Math.floor(Date.now() / 1000).toString();
const message = `v0:${timestamp}:${body}`;
const signature = `v0=${createHmac("sha256", secretToken).update(message).digest("hex")}`;

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-zm-request-timestamp": timestamp,
    "x-zm-signature": signature
  },
  body
});

const rawResponse = await response.text();
let parsedResponse = rawResponse;

try {
  parsedResponse = JSON.parse(rawResponse);
} catch {
  parsedResponse = rawResponse;
}

console.log(JSON.stringify({
  event,
  webhook_url: webhookUrl,
  status: response.status,
  ok: response.ok,
  response: parsedResponse
}, null, 2));
