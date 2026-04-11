import { appConfig } from "./config.mjs";

export async function deleteSlackMessage({ channel, ts }) {
	if (!appConfig.slackBotToken) {
		throw new Error("SLACK_BOT_TOKEN is required");
	}

	const response = await fetch("https://slack.com/api/chat.delete", {
		method: "POST",
		headers: {
			authorization: `Bearer ${appConfig.slackBotToken}`,
			"content-type": "application/json; charset=utf-8",
		},
		body: JSON.stringify({
			channel,
			ts,
		}),
	});

	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(`Slack API request failed: ${response.status}`);
	}

	if (!payload?.ok) {
		throw new Error(payload?.error ?? "Slack delete failed");
	}

	return payload;
}
