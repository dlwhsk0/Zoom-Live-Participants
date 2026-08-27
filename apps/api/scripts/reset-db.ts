/**
 * 테이블 내용을 비운다. 스키마와 마이그레이션 기록은 남긴다.
 *
 * 테스트/검증 데이터를 걷어낼 때 쓴다.
 * 실수로 운영 데이터를 지우지 않도록 --yes 를 요구한다.
 *
 * 실행: node --env-file=../../.env --experimental-strip-types scripts/reset-db.ts --yes
 */
import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../src/db/client.ts";
import {
	participantEvents,
	participants,
	webhookEvents,
} from "../src/db/schema.ts";

const db = getDb();

async function counts(): Promise<Record<string, number>> {
	const [w] = await db.select({ n: sql<number>`count(*)::int` }).from(webhookEvents);
	const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(participantEvents);
	const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(participants);
	return {
		webhook_events: w?.n ?? 0,
		participant_events: p?.n ?? 0,
		participants: c?.n ?? 0,
	};
}

const before = await counts();
const total = Object.values(before).reduce((a, b) => a + b, 0);

console.log("현재 행 수:");
for (const [table, n] of Object.entries(before)) {
	console.log(`  ${table} = ${n}`);
}

if (total === 0) {
	console.log("\n이미 비어 있습니다.");
	await closeDb();
	process.exit(0);
}

if (!process.argv.includes("--yes")) {
	console.log(`\n${total}행을 지우려면 --yes 를 붙여 다시 실행하세요.`);
	await closeDb();
	process.exit(1);
}

await db.execute(
	sql`truncate ${participants}, ${participantEvents}, ${webhookEvents}`,
);

const after = await counts();
console.log("\n삭제 후:");
for (const [table, n] of Object.entries(after)) {
	console.log(`  ${table} = ${n}`);
}
console.log("\n스키마와 마이그레이션 기록은 유지됩니다.");

await closeDb();
