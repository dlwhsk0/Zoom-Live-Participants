import type { getDb } from "../db/client.ts";
import {
	participantEventsApplied,
	roomMoves,
	webhooksDuplicate,
	webhooksReceived,
	webhooksRejected,
} from "../metrics.ts";
import {
	hasOppositeEventAt,
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
 * 같은 참가자의 같은 발생 시각에 반대 종류의 이벤트가 이미 있는가.
 *
 * left 와 joined 가 동일 시각으로 짝을 이루면 소회의실 이동이다.
 * 쌍의 뒤쪽이 도착했을 때만 1 을 세도록 반대 종류만 찾는다.
 */
async function isRoomMove(
	db: Db,
	event: NonNullable<ReturnType<typeof toParticipantEvent>>,
): Promise<boolean> {
	try {
		return await hasOppositeEventAt(
			db,
			event.meetingUuid,
			event.participantUuid,
			event.occurredAt,
			event.eventType === "joined" ? "left" : "joined",
		);
	} catch {
		// 메트릭 때문에 웹훅 처리가 실패하면 안 된다
		return false;
	}
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
		webhooksRejected.inc({ reason: verification.reason });
		return { status: 401, body: { ok: false, reason: verification.reason } };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		webhooksRejected.inc({ reason: "invalid json" });
		return { status: 400, body: { ok: false, reason: "invalid json" } };
	}

	let body: ReturnType<typeof parseWebhookBody>;
	try {
		body = parseWebhookBody(parsed);
	} catch {
		webhooksRejected.inc({ reason: "unexpected payload" });
		return { status: 400, body: { ok: false, reason: "unexpected payload" } };
	}

	webhooksReceived.inc({ event: body.event.replace(/^meeting\./, "") });

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
		webhooksDuplicate.inc();
		return { status: 200, body: { ok: true, duplicate: true } };
	}

	if (participantEvent) {
		await insertParticipantEvent(db, webhookEventId, participantEvent);
		await upsertParticipant(db, participantEvent);

		participantEventsApplied.inc({ event_type: participantEvent.eventType });

		// 같은 참가자의 같은 발생 시각에 반대 이벤트가 이미 있으면 방 이동이다.
		// 판정 규칙의 핵심이라 얼마나 자주 일어나는지 따로 센다.
		if (await isRoomMove(db, participantEvent)) {
			roomMoves.inc();
		}

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
