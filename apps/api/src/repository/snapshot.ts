import { asc, gte, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { dailySnapshots } from "../db/schema.ts";
import type { DayBucket } from "../domain/stats.ts";
import { buildStats } from "../domain/stats.ts";
import { findIntervalsInRange } from "./stats.ts";

type Db = ReturnType<typeof getDb>;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 그날 0시의 UTC 밀리초. */
function kstMidnight(ms: number): number {
	const shifted = ms + KST_OFFSET_MS;
	return shifted - (shifted % DAY_MS) - KST_OFFSET_MS;
}

/**
 * 하루치를 다시 세어 저장한다.
 *
 * 세는 일은 통계 화면과 **같은 코드**(buildStats)가 한다. 스냅샷 전용 계산을
 * 따로 두면 둘이 어긋났을 때 어느 쪽이 맞는지 알 수 없다.
 *
 * 이미 있으면 덮어쓴다. 규칙이 바뀌면 다시 만들 수 있어야 한다.
 */
export async function snapshotDay(db: Db, date: string): Promise<DayBucket> {
	const from = new Date(`${date}T00:00:00+09:00`);
	const to = new Date(from.getTime() + DAY_MS);

	const people = await findIntervalsInRange(db, from, to);
	const stats = buildStats(people, from, to, new Date());
	const bucket = stats.days[0];

	if (!bucket) throw new Error(`${date} 를 세지 못했습니다`);

	await db
		.insert(dailySnapshots)
		.values({
			date: bucket.date,
			people: bucket.people,
			seconds: bucket.seconds,
			peak: bucket.peak,
			firstAt: bucket.firstAt,
			lastAt: bucket.lastAt,
		})
		.onConflictDoUpdate({
			target: dailySnapshots.date,
			set: {
				people: bucket.people,
				seconds: bucket.seconds,
				peak: bucket.peak,
				firstAt: bucket.firstAt,
				lastAt: bucket.lastAt,
				computedAt: sql`now()`,
			},
		});

	return bucket;
}

/**
 * 회의가 끝났을 때 부른다.
 *
 * 그날과 **전날**을 함께 다시 센다. 이 모임은 밤을 넘기므로 한 번의 모임이
 * 두 날짜에 걸친다 — 끝난 날짜만 세면 전날 몫이 빠진 채로 굳는다.
 *
 * 실패해도 웹훅 응답을 막지 않는다. 스냅샷은 다시 만들 수 있고, 여기서
 * 던지면 Zoom 이 같은 웹훅을 계속 다시 보낸다.
 */
export async function snapshotAround(db: Db, at: Date): Promise<void> {
	const midnight = kstMidnight(at.getTime());

	for (const ms of [midnight - DAY_MS, midnight]) {
		const date = new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

		try {
			await snapshotDay(db, date);
		} catch (error) {
			console.error(`[snapshot] ${date} 실패`, error);
		}
	}
}

export interface SnapshotRow {
	date: string;
	people: number;
	seconds: number;
	peak: number;
	firstAt: string | null;
	lastAt: string | null;
}

/** 저장된 일별 기록. 이 날짜부터 오늘까지. */
export async function findSnapshots(
	db: Db,
	from: string,
): Promise<SnapshotRow[]> {
	return db
		.select({
			date: dailySnapshots.date,
			people: dailySnapshots.people,
			seconds: dailySnapshots.seconds,
			peak: dailySnapshots.peak,
			firstAt: dailySnapshots.firstAt,
			lastAt: dailySnapshots.lastAt,
		})
		.from(dailySnapshots)
		.where(gte(dailySnapshots.date, from))
		.orderBy(asc(dailySnapshots.date));
}
