import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");

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
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getZoomConfig() {
  return {
    accountId: requiredEnv("ZOOM_ACCOUNT_ID"),
    clientId: requiredEnv("ZOOM_CLIENT_ID"),
    clientSecret: requiredEnv("ZOOM_CLIENT_SECRET")
  };
}

export function getDefaultMeetingId() {
  return process.env.ZOOM_MEETING_ID ?? "";
}

export async function getAccessToken() {
  const { accountId, clientId, clientSecret } = getZoomConfig();
  const basicToken = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = new URL("https://zoom.us/oauth/token");

  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", accountId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicToken}`
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error("Failed to obtain Zoom access token");
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export async function zoomGet(pathname, searchParams = {}) {
  const token = await getAccessToken();
  const url = new URL(`https://api.zoom.us/v2${pathname}`);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.access_token}`
    }
  });

  const body = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    url: url.toString(),
    body
  };
}

export function printResult(label, result) {
  console.log(`\n[${label}]`);
  console.log(`status: ${result.status}`);
  console.log(`url: ${result.url}`);
  console.log(JSON.stringify(result.body, null, 2));
}

export function getCliMeetingId() {
  return process.argv[2] || getDefaultMeetingId();
}
