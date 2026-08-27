/**
 * fixture 162건을 실제 웹훅 경로로 흘려보내 DB 결과를 검증한다.
 *
 * implementation-plan.md 3단계의 완료 기준:
 * "fixture 를 로컬 서버에 밀어 넣었을 때 participants 조회 결과가
 *  1단계 테스트와 일치한다"
 *
 * 실행: node --env-file=../../.env.local --experimental-strip-types scripts/replay-fixture.ts
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { getDb, closeDb } from "../src/db/client.ts";
import { getEnv } from "../src/config/env.ts";
import { handleWebhook } from "../src/webhook/handle.ts";
import { getPresenceSnapshot } from "../src/repository/query.ts";
import { reducePresence, listPresent, participantKey } from "../src/domain/presence.ts";
import { participantEvents, participants, webhookEvents } from "../src/db/schema.ts";
import { sql } from "drizzle-orm";
import type { ParticipantEvent } from "../src/domain/presence.ts";

const FIXTURE = new URL("../test/fixtures/webhook-events.ndjson", import.meta.url);

interface Row {
	event: string;
	raw?: unknown;
}

function sign(secret: string, rawBody: string, ts: string): Record<string, string> {
	return {
		"x-zm-signature": `v0=${createHmac("sha256", secret).update(`v0:${ts}:${rawBody}`).digest("hex")}`,
		"x-zm-request-timestamp": ts,
	};
}

/** fixture 원본을 도메인 이벤트로. 기대값 계산용. */
function toExpectedEvents(rows: Row[]): ParticipantEvent[] {
	const out: ParticipantEvent[] = [];
	for (const row of rows) {
		const raw = row.raw as
			| { event: string; payload?: { object?: Record<string, unknown> } }
			| undefined;
		if (!raw?.payload?.object) continue;
		const isJoin = raw.event === "meeting.participant_joined";
		const isLeft = raw.event === "meeting.participant_left";
		if (!isJoin && !isLeft) continue;
		const obj = raw.payload.object as {
			uuid?: string;
			id?: string | number;
			participant?: Record<string, string>;
		};
		const p = obj.participant;
		const occ = isJoin ? p?.join_time : p?.leave_time;
		if (!obj.uuid || !p?.participant_uuid || !occ) continue;
		out.push({
			meetingId: obj.id === undefined ? "" : String(obj.id),
			meetingUuid: obj.uuid,
			participantUuid: p.participant_uuid,
			eventType: isJoin ? "joined" : "left",
			occurredAt: new Date(occ),
			displayName: p.user_name ?? null,
			userId: p.user_id ?? null,
			leaveReason: p.leave_reason ?? null,
		});
	}
	return out;
}

const rows: Row[] = readFileSync(FIXTURE, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((l) => JSON.parse(l) as Row);

const bodies = rows.map((r) => r.raw).filter((r) => r !== undefined);
const db = getDb();
const secret = getEnv().ZOOM_WEBHOOK_SECRET_TOKEN;

console.log(`fixture ${bodies.length}건 재생 시작`);

let applied = 0;
let duplicate = 0;
let ignored = 0;
let failed = 0;

for (const [index, body] of bodies.entries()) {
	const rawBody = JSON.stringify(body);
	const ts = String(1700000000 + index);
	const result = await handleWebhook({
		db,
		secretToken: secret,
		headers: sign(secret, rawBody, ts),
		rawBody,
	});

	const payload = result.body as Record<string, unknown>;
	if (result.status !== 200) failed++;
	else if (payload.duplicate) duplicate++;
	else if (payload.applied) applied++;
	else ignored++;
}

console.log(`  적용 ${applied} / 중복 ${duplicate} / 무시 ${ignored} / 실패 ${failed}`);

// 같은 fixture 를 한 번 더 밀어 멱등성 확인
let secondDuplicate = 0;
for (const [index, body] of bodies.entries()) {
	const rawBody = JSON.stringify(body);
	const ts = String(1700000000 + index);
	const result = await handleWebhook({
		db,
		secretToken: secret,
		headers: sign(secret, rawBody, ts),
		rawBody,
	});
	if ((result.body as Record<string, unknown>).duplicate) secondDuplicate++;
}
console.log(`재전송 시 중복으로 걸러진 건수: ${secondDuplicate} (기대 ${bodies.length})`);

// 기대값: 1단계 순수 함수로 계산한 결과
const expected = reducePresence(toExpectedEvents(rows));
const meetingId = getEnv().ZOOM_MEETING_ID ?? "";
const snapshot = await getPresenceSnapshot(db, meetingId);

console.log("\n[현재 세션 조회]");
console.log("  세션:", snapshot.meetingUuid);
console.log("  접속자:", snapshot.count, "명 (기대", listPresent(expected, snapshot.meetingUuid ?? undefined).length, "명)");

// 접속자 수 비교만으로는 약하다. participants 테이블 전체를 대조한다.
const stored = await db
	.select({
		meetingUuid: participants.meetingUuid,
		participantUuid: participants.participantUuid,
		isPresent: participants.isPresent,
		lastEventType: participants.lastEventType,
		lastOccurredAt: participants.lastOccurredAt,
		firstJoinedAt: participants.firstJoinedAt,
	})
	.from(participants);

console.log("\n[participants 테이블 전수 대조]");
console.log("  DB 행 수:", stored.length, "/ 기대", expected.size);

const problems: string[] = [];
for (const row of stored) {
	const key = participantKey(row.meetingUuid, row.participantUuid);
	const want = expected.get(key);
	if (!want) {
		problems.push(`DB에만 존재: ${key}`);
		continue;
	}
	if (row.isPresent !== want.isPresent) {
		problems.push(`isPresent 불일치 ${key}: DB=${row.isPresent} 기대=${want.isPresent}`);
	}
	if (row.lastEventType !== want.lastEventType) {
		problems.push(`lastEventType 불일치 ${key}`);
	}
	if (row.lastOccurredAt.getTime() !== want.lastOccurredAt.getTime()) {
		problems.push(`lastOccurredAt 불일치 ${key}`);
	}
	const wantFirst = want.firstJoinedAt?.getTime() ?? null;
	const gotFirst = row.firstJoinedAt?.getTime() ?? null;
	if (wantFirst !== gotFirst) {
		problems.push(`firstJoinedAt 불일치 ${key}: DB=${gotFirst} 기대=${wantFirst}`);
	}
}
for (const key of expected.keys()) {
	if (!stored.some((r) => participantKey(r.meetingUuid, r.participantUuid) === key)) {
		problems.push(`DB에 없음: ${key}`);
	}
}

const countMatches = stored.length === expected.size;
console.log("  불일치 항목:", problems.length);
for (const p of problems.slice(0, 5)) console.log("    -", p);

// 로그 테이블도 확인
const [eventCount] = await db
	.select({ n: sql<number>`count(*)::int` })
	.from(participantEvents);
const [rawCount] = await db
	.select({ n: sql<number>`count(*)::int` })
	.from(webhookEvents);

console.log("\n[로그 테이블]");
console.log("  participant_events:", eventCount?.n, `(기대 ${applied})`);
console.log("  webhook_events:", rawCount?.n, `(기대 ${bodies.length} — 참가자 ${applied} + 기타 ${ignored})`);

// 재전송 시에는 참가자·회의 이벤트가 전부 중복으로 걸러져야 한다
const ok =
	problems.length === 0 &&
	countMatches &&
	failed === 0 &&
	eventCount?.n === applied &&
	rawCount?.n === bodies.length &&
	secondDuplicate === bodies.length;

console.log("\n" + (ok ? "✅ 3단계 완료 기준 충족" : "❌ 불일치 있음"));

await closeDb();
process.exitCode = ok ? 0 : 1;
