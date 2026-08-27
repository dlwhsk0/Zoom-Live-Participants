import type { getDb } from "../db/client.ts";
import {
	insertParticipantEvent,
	insertWebhookEvent,
	markSessionEnded,
	upsertParticipant,
} from "../repository/ingest.ts";
import {
	buildDedupeKey,
	buildMeetingDedupeKey,
	MEETING_ENDED,
	parseWebhookBody,
	toParticipantEvent,
	URL_VALIDATION,
} from "./normalize.ts";
import { buildUrlValidationResponse, verifySignature } from "./signature.ts";

type Db = ReturnType<typeof getDb>;

export interface HandleInput {
	db: Db;
	secretToken: string;
	headers: Record<string, string | string[] | undefined>;
	rawBody: string;
	now?: Date;
}

export interface HandleOutput {
	status: number;
	body: unknown;
}

/**
 * 웹훅 처리.
 *
 * 순서:
 *   1. 서명 검증 (실패 시 401)
 *   2. endpoint.url_validation 즉시 응답
 *   3. 원본 저장. dedupe_key 충돌이면 이미 처리한 이벤트이므로 조용히 종료
 *   4. participant_events 기록
 *   5. participants upsert
 *   6. meeting.ended 면 세션 정리
 *
 * 응답은 항상 빠르게 준다. Zoom 은 응답이 늦으면 재전송한다.
 */
export async function handleWebhook(
	input: HandleInput,
): Promise<HandleOutput> {
	const { db, secretToken, headers, rawBody } = input;
	const now = input.now ?? new Date();

	const verification = verifySignature(secretToken, headers, rawBody);
	if (!verification.ok) {
		return { status: 401, body: { ok: false, reason: verification.reason } };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return { status: 400, body: { ok: false, reason: "invalid json" } };
	}

	let body: ReturnType<typeof parseWebhookBody>;
	try {
		body = parseWebhookBody(parsed);
	} catch {
		return { status: 400, body: { ok: false, reason: "unexpected payload" } };
	}

	if (body.event === URL_VALIDATION) {
		const plainToken = body.payload.plainToken;
		if (!plainToken) {
			return { status: 400, body: { ok: false, reason: "missing plainToken" } };
		}
		return {
			status: 200,
			body: buildUrlValidationResponse(secretToken, plainToken),
		};
	}

	const participantEvent = toParticipantEvent(body);
	const dedupeKey = participantEvent
		? buildDedupeKey(participantEvent)
		: buildMeetingDedupeKey(body, now);

	const webhookEventId = await insertWebhookEvent(db, parsed, dedupeKey);

	if (!webhookEventId) {
		// 이미 처리한 이벤트. Zoom 재전송이므로 정상 응답한다.
		return { status: 200, body: { ok: true, duplicate: true } };
	}

	if (participantEvent) {
		await insertParticipantEvent(db, webhookEventId, participantEvent);
		await upsertParticipant(db, participantEvent);
		return { status: 200, body: { ok: true, applied: participantEvent.eventType } };
	}

	if (body.event === MEETING_ENDED) {
		const meetingUuid = body.payload.object?.uuid;
		if (meetingUuid) {
			const cleared = await markSessionEnded(db, meetingUuid);
			return { status: 200, body: { ok: true, sessionEnded: true, cleared } };
		}
	}

	// 관심 없는 이벤트도 원본은 보관하고 200 을 준다.
	return { status: 200, body: { ok: true, ignored: body.event } };
}
