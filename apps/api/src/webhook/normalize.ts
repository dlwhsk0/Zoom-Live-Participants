import { z } from "zod";

import type { ParticipantEvent } from "../domain/presence.ts";

/**
 * Zoom 웹훅 payload 검증과 정규화.
 *
 * 알 수 없는 필드는 그대로 통과시킨다(Zoom 이 필드를 늘려도 깨지지 않게).
 * 판정에 필요한 최소 필드만 강제한다.
 */
const participantSchema = z.object({
	participant_uuid: z.string().min(1),
	user_id: z.string().optional(),
	user_name: z.string().optional(),
	public_ip: z.string().optional(),
	join_time: z.string().optional(),
	leave_time: z.string().optional(),
	leave_reason: z.string().optional(),
});

const payloadSchema = z.object({
	event: z.string().min(1),
	/** Zoom 이 이벤트를 만든 시각(ms). 재전송해도 값이 같다. */
	event_ts: z.number().optional(),
	payload: z.object({
		plainToken: z.string().optional(),
		object: z
			.object({
				id: z.union([z.string(), z.number()]).optional(),
				uuid: z.string().optional(),
				participant: participantSchema.optional(),
			})
			.optional(),
	}),
});

export type ZoomWebhookBody = z.infer<typeof payloadSchema>;

export const PARTICIPANT_JOINED = "meeting.participant_joined";
export const PARTICIPANT_LEFT = "meeting.participant_left";
export const MEETING_ENDED = "meeting.ended";
export const URL_VALIDATION = "endpoint.url_validation";

export function parseWebhookBody(input: unknown): ZoomWebhookBody {
	return payloadSchema.parse(input);
}

/**
 * 참가자 입퇴장 이벤트를 도메인 타입으로 변환한다.
 * 대상이 아니거나 필수 필드가 없으면 null 을 반환한다.
 */
export function toParticipantEvent(
	body: ZoomWebhookBody,
): ParticipantEvent | null {
	const isJoin = body.event === PARTICIPANT_JOINED;
	const isLeft = body.event === PARTICIPANT_LEFT;
	if (!isJoin && !isLeft) return null;

	const object = body.payload.object;
	const participant = object?.participant;
	if (!object?.uuid || !participant) return null;

	const occurredRaw = isJoin ? participant.join_time : participant.leave_time;
	if (!occurredRaw) return null;

	const occurredAt = new Date(occurredRaw);
	if (Number.isNaN(occurredAt.getTime())) return null;

	return {
		meetingId: object.id === undefined ? "" : String(object.id),
		meetingUuid: object.uuid,
		participantUuid: participant.participant_uuid,
		eventType: isJoin ? "joined" : "left",
		occurredAt,
		displayName: participant.user_name ?? null,
		userId: participant.user_id ?? null,
		publicIp: participant.public_ip || null,
		leaveReason: participant.leave_reason ?? null,
	};
}

/**
 * 멱등성 키.
 *
 * meeting_uuid | participant_uuid | event_type | occurred_at
 * fixture 157건 전수 적용 시 충돌 0건.
 * occurred_at 은 발생 시각이라 Zoom 이 재전송해도 값이 같다.
 */
export function buildDedupeKey(event: ParticipantEvent): string {
	return [
		event.meetingUuid,
		event.participantUuid,
		event.eventType,
		event.occurredAt.toISOString(),
	].join("|");
}

/**
 * 참가자 이벤트가 아닌 경우(meeting.started/ended 등)의 멱등성 키.
 *
 * event_ts 는 Zoom 이 이벤트를 만든 시각이라 재전송해도 값이 같다.
 * 수신 시각을 쓰면 재전송마다 다른 키가 되어 중복이 걸러지지 않는다.
 * event_ts 가 없는 경우에만 수신 시각으로 물러선다.
 */
export function buildMeetingDedupeKey(
	body: ZoomWebhookBody,
	receivedAt: Date,
): string {
	const uuid = body.payload.object?.uuid ?? "unknown";
	const stamp =
		body.event_ts === undefined
			? receivedAt.toISOString()
			: String(body.event_ts);

	return [uuid, body.event, stamp].join("|");
}
