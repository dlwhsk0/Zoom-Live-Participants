import {
	appConfig,
	slackJoinTemplates,
	slackLeftTemplates,
} from "./config.mjs";

function pickRandom(list) {
	if (!Array.isArray(list) || list.length === 0) {
		return "";
	}

	return list[Math.floor(Math.random() * list.length)];
}

function shouldNotifySlack(entry) {
	if (!appConfig.slackWebhookUrl) {
		return false;
	}

	if (
		appConfig.slackNotifyMeetingId &&
		String(entry.meeting_id ?? "") !== appConfig.slackNotifyMeetingId
	) {
		return false;
	}

	if (
		appConfig.slackNotifyEvents.size > 0 &&
		!appConfig.slackNotifyEvents.has(String(entry.event ?? ""))
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

export async function notifySlack(entry) {
	if (!shouldNotifySlack(entry)) {
		return;
	}

	const response = await fetch(appConfig.slackWebhookUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(buildSlackMessage(entry)),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Slack webhook failed: ${response.status} ${body}`.trim(),
		);
	}
}
