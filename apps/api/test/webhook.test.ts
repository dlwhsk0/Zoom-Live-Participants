import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
	buildDedupeKey,
	buildMeetingDedupeKey,
	parseWebhookBody,
	toParticipantEvent,
} from "../src/webhook/normalize.ts";
import { verifySignature } from "../src/webhook/signature.ts";
import { loadRawZoomBodies } from "./fixture.ts";

const SECRET = "test-secret-token";

function sign(rawBody: string, timestamp: string): string {
	return `v0=${createHmac("sha256", SECRET)
		.update(`v0:${timestamp}:${rawBody}`)
		.digest("hex")}`;
}

describe("서명 검증", () => {
	const rawBody = JSON.stringify({ event: "test" });
	const ts = "1700000000";

	it("올바른 서명을 통과시킨다", () => {
		const result = verifySignature(SECRET, {
			"x-zm-signature": sign(rawBody, ts),
			"x-zm-request-timestamp": ts,
		}, rawBody);
		expect(result.ok).toBe(true);
	});

	it("secret 이 없으면 거부한다 — v1은 통과시켰다", () => {
		const result = verifySignature("", {
			"x-zm-signature": sign(rawBody, ts),
			"x-zm-request-timestamp": ts,
		}, rawBody);
		expect(result.ok).toBe(false);
	});

	it("헤더가 없으면 거부한다", () => {
		expect(verifySignature(SECRET, {}, rawBody).ok).toBe(false);
	});

	it("본문이 변조되면 거부한다", () => {
		const result = verifySignature(SECRET, {
			"x-zm-signature": sign(rawBody, ts),
			"x-zm-request-timestamp": ts,
		}, `${rawBody} tampered`);
		expect(result.ok).toBe(false);
	});

	it("서명 길이가 달라도 예외를 던지지 않는다", () => {
		expect(() =>
			verifySignature(SECRET, {
				"x-zm-signature": "v0=short",
				"x-zm-request-timestamp": ts,
			}, rawBody),
		).not.toThrow();
	});
});

describe("payload 정규화", () => {
	const bodies = loadRawZoomBodies().map((raw) => parseWebhookBody(raw));

	it("Zoom 원본 body 를 그대로 파싱한다", () => {
		expect(bodies).toHaveLength(162);
	});

	it("fixture 의 참가자 이벤트를 전부 변환한다", () => {
		const participantBodies = bodies.filter((b) =>
			b.event.startsWith("meeting.participant_"),
		);
		const converted = participantBodies
			.map((b) => toParticipantEvent(b))
			.filter((e) => e !== null);

		expect(participantBodies).toHaveLength(157);
		expect(converted).toHaveLength(157);
	});

	it("meeting.started / ended 는 참가자 이벤트가 아니다", () => {
		const others = bodies.filter(
			(b) => !b.event.startsWith("meeting.participant_"),
		);
		expect(others.length).toBeGreaterThan(0);
		for (const body of others) {
			expect(toParticipantEvent(body)).toBeNull();
		}
	});

	it("알 수 없는 필드가 있어도 파싱된다", () => {
		const body = parseWebhookBody({
			event: "meeting.participant_joined",
			payload: {
				object: {
					uuid: "u1",
					id: 123,
					participant: { participant_uuid: "p1", join_time: "2026-01-01T00:00:00Z" },
					brandNewFieldFromZoom: true,
				},
			},
			anotherNewField: "x",
		});
		expect(body.event).toBe("meeting.participant_joined");
	});

	it("meeting id 가 숫자로 와도 문자열로 정규화한다", () => {
		const event = toParticipantEvent(
			parseWebhookBody({
				event: "meeting.participant_joined",
				payload: {
					object: {
						uuid: "u1",
						id: 10000000001,
						participant: {
							participant_uuid: "p1",
							join_time: "2026-01-01T00:00:00Z",
						},
					},
				},
			}),
		);
		expect(event?.meetingId).toBe("10000000001");
	});
});

describe("dedupe_key", () => {
	it("fixture 157건에서 충돌하지 않는다", () => {
		const keys = loadRawZoomBodies()
			.map((raw) => parseWebhookBody(raw))
			.map((b) => toParticipantEvent(b))
			.filter((e) => e !== null)
			.map((e) => buildDedupeKey(e));

		expect(keys).toHaveLength(157);
		expect(new Set(keys).size).toBe(157);
	});

	it("같은 이벤트는 같은 키를 만든다 — 재전송 멱등성", () => {
		const raw = loadRawZoomBodies().find((r) =>
			(r as { event: string }).event.startsWith("meeting.participant_"),
		);
		const a = toParticipantEvent(parseWebhookBody(raw));
		const b = toParticipantEvent(parseWebhookBody(raw));
		expect(a).not.toBeNull();
		expect(buildDedupeKey(a!)).toBe(buildDedupeKey(b!));
	});

	it("방 이동의 left 와 joined 는 시각이 같아도 다른 키를 만든다", () => {
		const base = {
			meetingId: "m",
			meetingUuid: "s",
			participantUuid: "p",
			occurredAt: new Date("2026-01-01T00:00:00Z"),
			displayName: null,
			userId: null,
			leaveReason: null,
		};
		const leftKey = buildDedupeKey({ ...base, eventType: "left" });
		const joinKey = buildDedupeKey({ ...base, eventType: "joined" });
		expect(leftKey).not.toBe(joinKey);
	});
});

describe("meeting 이벤트 멱등성", () => {
	const bodies = loadRawZoomBodies().map((raw) => parseWebhookBody(raw));
	const meetingBodies = bodies.filter(
		(b) => !b.event.startsWith("meeting.participant_"),
	);

	it("fixture 에 meeting.started / ended 가 5건 있다", () => {
		expect(meetingBodies).toHaveLength(5);
	});

	it("수신 시각이 달라도 같은 키를 만든다 — 재전송 멱등성", () => {
		for (const body of meetingBodies) {
			const first = buildMeetingDedupeKey(body, new Date("2026-01-01T00:00:00Z"));
			const second = buildMeetingDedupeKey(body, new Date("2026-06-01T12:34:56Z"));
			expect(first).toBe(second);
		}
	});

	it("서로 다른 meeting 이벤트는 다른 키를 만든다", () => {
		const keys = meetingBodies.map((b) => buildMeetingDedupeKey(b, new Date()));
		expect(new Set(keys).size).toBe(meetingBodies.length);
	});

	it("event_ts 가 없으면 수신 시각으로 물러선다", () => {
		const body = parseWebhookBody({
			event: "meeting.ended",
			payload: { object: { uuid: "u1" } },
		});
		const a = buildMeetingDedupeKey(body, new Date("2026-01-01T00:00:00Z"));
		const b = buildMeetingDedupeKey(body, new Date("2026-01-01T00:00:01Z"));
		expect(a).not.toBe(b);
	});
});
