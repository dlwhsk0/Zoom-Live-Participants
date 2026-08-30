import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ParticipantEvent } from "../src/domain/presence.ts";
import {
	parseWebhookBody,
	toParticipantEvent,
} from "../src/webhook/normalize.ts";

const FIXTURE_PATH = fileURLToPath(
	new URL("./fixtures/webhook-events.ndjson", import.meta.url),
);

interface RawFixtureRow {
	event: string;
	/** Zoom 이 실제로 보낸 원본 body. 웹훅 핸들러가 받는 것과 같은 형태다. */
	raw?: unknown;
	meeting_id?: string;
	meeting_uuid?: string;
	participant?: {
		participant_uuid?: string;
		user_id?: string;
		user_name?: string;
		join_time?: string;
		leave_time?: string;
		leave_reason?: string;
	};
}

export function loadFixtureRows(): RawFixtureRow[] {
	return readFileSync(FIXTURE_PATH, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as RawFixtureRow);
}

/**
 * Zoom 원본 body 목록.
 *
 * fixture 의 각 행은 v1 이 정규화한 형태이고,
 * Zoom 이 실제로 보낸 body 는 raw 필드에 그대로 들어 있다.
 * 웹훅 핸들러 테스트는 이쪽을 써야 한다.
 */
export function loadRawZoomBodies(): unknown[] {
	return loadFixtureRows()
		.map((row) => row.raw)
		.filter((raw): raw is unknown => raw !== undefined);
}

/**
 * fixture 의 참가자 입퇴장 이벤트를 도메인 타입으로 변환한다.
 *
 * 손으로 필드를 옮겨 담지 않고 실제 수신 경로(parseWebhookBody +
 * toParticipantEvent)를 그대로 통과시킨다. 예전에는 여기서 직접 만들었는데,
 * 도메인 타입에 필드가 늘어도 이 파일이 따라가지 않아 조용히 어긋났다.
 * publicIp 가 실제로 그렇게 빠져 있었다.
 */
export function loadFixtureEvents(): ParticipantEvent[] {
	const events: ParticipantEvent[] = [];

	for (const raw of loadRawZoomBodies()) {
		const event = toParticipantEvent(parseWebhookBody(raw));
		if (event) events.push(event);
	}

	return events;
}

/** 발생 시각 오름차순. 동일 시각이면 joined 를 먼저 둔다. */
export function inOccurrenceOrder(
	events: readonly ParticipantEvent[],
): ParticipantEvent[] {
	return [...events].sort((a, b) => {
		const diff = a.occurredAt.getTime() - b.occurredAt.getTime();
		if (diff !== 0) return diff;
		return a.eventType === "joined" ? -1 : 1;
	});
}

/** 시드 기반 셔플. 테스트가 재현 가능해야 하므로 Math.random 을 쓰지 않는다. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
	const out = [...items];
	let state = seed;

	for (let i = out.length - 1; i > 0; i--) {
		state = (state * 1664525 + 1013904223) % 4294967296;
		const j = state % (i + 1);
		const a = out[i] as T;
		const b = out[j] as T;
		out[i] = b;
		out[j] = a;
	}

	return out;
}
