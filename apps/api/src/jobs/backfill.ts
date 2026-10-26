/**
 * 끝난 세션을 Report API 로 훑어 놓친 입퇴장을 메꾼다.
 *
 * 세 군데서 돈다. 모두 같은 함수(backfillSession)를 부른다.
 *   - meeting.ended 웹훅을 받으면 그 세션을 (scheduleSessionBackfill)
 *   - 매일 04:30 최근 며칠치를 (runDailyBackfill) — 서버가 끊긴 동안 회의가
 *     끝나면 meeting.ended 자체를 못 받는다. 그때를 위한 안전망이다
 *   - 손으로 (scripts/backfill-report.ts)
 *
 * 이미 메꾼 세션을 다시 돌려도 아무것도 바뀌지 않는다 — 빠진 것만 넣고,
 * 넣은 것은 다음 번에 "이미 있는 것" 으로 맞는다. 그래서 며칠치를 매번
 * 다시 훑는다. Report API 는 세션이 끝나고 한참 뒤에야 채워지기도 한다.
 */
import type { getDb } from "../db/client.ts";
import { planBackfill, RECEIVING_WINDOW_MS } from "../domain/backfill.ts";
import type { BackfillPlan } from "../domain/backfill.ts";
import {
	backfillEvents,
	backfillLastSuccess,
	backfillSessions,
} from "../metrics.ts";
import {
	applyBackfill,
	findReceivedTimes,
	findSessionEvents,
} from "../repository/backfill.ts";
import { markSessionEnded } from "../repository/ingest.ts";
import { snapshotAround } from "../repository/snapshot.ts";
import type { ZoomReportClient } from "../zoom/report-api.ts";

type Db = ReturnType<typeof getDb>;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 매일 배치가 다시 훑는 기간. 세션이 며칠씩 이어져도 끝난 뒤 이 안에 잡힌다. */
export const DAILY_LOOKBACK_DAYS = 7;

export interface SessionResult {
	meetingUuid: string;
	startTime: Date;
	plan: Omit<BackfillPlan, "events"> & { planned: number } | null;
	/** 실제로 넣은 수. 미리보기면 0 이다. */
	inserted: number;
	/** 묶음을 웹훅에 잇지 못해 가짜 uuid 로 넣은 수 */
	synthetic: number;
	error: string | null;
	/** 미리보기용. 넣을(넣은) 이벤트 목록. */
	events: { at: Date; eventType: string; name: string | null; anchored: boolean }[];
}

export interface BackfillOptions {
	db: Db;
	zoom: ZoomReportClient;
	meetingId: string;
	/** 이 시각 이후에 시작한 세션만 본다 */
	since: Date;
	/** 이 시각 이전에 시작한 세션만 본다. 비우면 지금까지. */
	until?: Date;
	/** false 면 계획만 세우고 넣지 않는다 */
	apply: boolean;
	force?: boolean;
	now?: Date;
}

export interface SessionInput {
	meetingId: string;
	meetingUuid: string;
	startTime: Date;
}

/** 세션 하나를 메꾼다. 던지지 않는다 — 문제는 result.error 에 담는다. */
export async function backfillSession(
	options: Pick<BackfillOptions, "db" | "zoom" | "apply" | "force" | "now">,
	session: SessionInput,
): Promise<SessionResult> {
	const { db, zoom } = options;
	const now = options.now ?? new Date();

	const result: SessionResult = {
		meetingUuid: session.meetingUuid,
		startTime: session.startTime,
		plan: null,
		inserted: 0,
		synthetic: 0,
		error: null,
		events: [],
	};

	try {
		const records = await zoom.listReportParticipants(session.meetingUuid);
		if (records.length === 0) {
			backfillSessions.inc({ result: "empty" });
			return result;
		}

		const known = await findSessionEvents(db, session.meetingUuid);

		const times = records.flatMap((record) => [
			record.joinTime.getTime(),
			record.leaveTime?.getTime() ?? record.joinTime.getTime(),
		]);
		const receivedAt = await findReceivedTimes(
			db,
			new Date(Math.min(...times) - RECEIVING_WINDOW_MS),
			new Date(Math.max(...times) + RECEIVING_WINDOW_MS),
		);

		const plan = planBackfill({
			meetingId: session.meetingId,
			meetingUuid: session.meetingUuid,
			meetingStartedAt: session.startTime,
			records,
			known,
			receivedAt,
			force: options.force,
		});

		const { events: planned, ...counts } = plan;
		result.plan = { ...counts, planned: planned.length };

		if (plan.skipReason) {
			backfillSessions.inc({ result: "skipped" });
			result.error = plan.skipReason;
			return result;
		}

		const applied = options.apply
			? await applyBackfill(db, planned, {
					meetingStartedAt: session.startTime,
					records: records.map((record) => record.raw),
					now,
				})
			: planned;

		result.events = applied.map((item) => ({
			at: item.event.occurredAt,
			eventType: item.event.eventType,
			name: item.event.displayName,
			anchored: item.anchored,
		}));
		result.synthetic = applied.filter((item) => !item.anchored).length;

		if (!options.apply) {
			backfillSessions.inc({ result: "preview" });
			return result;
		}

		result.inserted = applied.length;
		for (const item of applied) {
			backfillEvents.inc({ event_type: item.event.eventType });
		}

		// Report API 에 올라왔다는 것은 끝난 세션이라는 뜻이다. meeting.ended 를
		// 놓쳤으면 아직 "접속 중" 으로 남은 사람이 있다.
		await markSessionEnded(db, session.meetingUuid);

		// 숫자가 바뀌었으니 그 날짜의 기록을 다시 굳힌다
		if (applied.length > 0) {
			const days = new Set(
				applied.map((item) =>
					Math.floor((item.event.occurredAt.getTime() + KST_OFFSET_MS) / DAY_MS),
				),
			);
			for (const day of days) {
				await snapshotAround(db, new Date(day * DAY_MS - KST_OFFSET_MS));
			}
		}

		backfillSessions.inc({ result: applied.length > 0 ? "filled" : "complete" });
	} catch (error) {
		backfillSessions.inc({ result: "failed" });
		result.error = error instanceof Error ? error.message : String(error);
	}

	return result;
}

/** 기간 안에 시작한 끝난 세션을 모두 메꾼다. */
export async function runReportBackfill(
	options: BackfillOptions,
): Promise<SessionResult[]> {
	const instances = (await options.zoom.listPastInstances(options.meetingId))
		.filter(
			(instance) =>
				instance.startTime >= options.since &&
				(!options.until || instance.startTime < options.until),
		)
		.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

	const results: SessionResult[] = [];
	for (const instance of instances) {
		results.push(
			await backfillSession(options, {
				meetingId: options.meetingId,
				meetingUuid: instance.uuid,
				startTime: instance.startTime,
			}),
		);
	}
	return results;
}

function logResult(result: SessionResult): void {
	const label = `${result.startTime.toISOString()} ${result.meetingUuid}`;
	if (result.error) {
		console.error(`[backfill]   ${label}  ${result.error}`);
	} else if (result.inserted > 0) {
		console.log(
			`[backfill]   ${label}  +${result.inserted}` +
				(result.synthetic ? ` (웹훅에 잇지 못한 ${result.synthetic}건)` : ""),
		);
	}
}

/**
 * 회의가 끝난 뒤 Report API 를 부를 시각들.
 *
 * Report API 는 회의가 끝나자마자 채워지지 않는다. 한 번에 맞히려 하지 않고
 * 여러 번 부른다. 멱등이라 앞에서 다 메꿨으면 뒤는 아무것도 안 한다.
 */
export const SESSION_BACKFILL_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3600_000];

let sessionBackfill: { db: Db; zoom: ZoomReportClient } | null = null;

/** main.ts 가 자격증명이 있을 때만 켠다. 켜지 않으면 scheduleSessionBackfill 은 아무것도 안 한다. */
export function enableSessionBackfill(db: Db, zoom: ZoomReportClient): void {
	sessionBackfill = { db, zoom };
}

/**
 * meeting.ended 를 받았을 때 부른다. 웹훅 응답을 기다리게 하지 않는다.
 *
 * 타이머는 메모리에만 있어 그 사이 서버가 재시작되면 사라진다. 그 세션은
 * 새벽 배치가 줍는다.
 */
export function scheduleSessionBackfill(session: SessionInput): void {
	const target = sessionBackfill;
	if (!target) return;

	for (const delay of SESSION_BACKFILL_DELAYS_MS) {
		setTimeout(async () => {
			const result = await backfillSession(
				{ db: target.db, zoom: target.zoom, apply: true },
				session,
			);
			logResult(result);
		}, delay).unref();
	}
}

/** 매일 새벽 배치. 실패해도 던지지 않는다 — 서버가 같이 죽으면 안 된다. */
export async function runDailyBackfill(
	db: Db,
	zoom: ZoomReportClient,
	meetingId: string,
	now = new Date(),
): Promise<void> {
	const since = new Date(now.getTime() - DAILY_LOOKBACK_DAYS * DAY_MS);

	try {
		const results = await runReportBackfill({
			db,
			zoom,
			meetingId,
			since,
			apply: true,
			now,
		});

		const inserted = results.reduce((sum, r) => sum + r.inserted, 0);
		const failed = results.filter((r) => r.error);

		console.log(
			`[backfill] 세션 ${results.length}개를 훑어 ${inserted}건을 메꿨다` +
				(failed.length ? ` (문제 ${failed.length}개)` : ""),
		);
		for (const r of results) logResult(r);

		backfillLastSuccess.set(Math.floor(Date.now() / 1000));
	} catch (error) {
		console.error("[backfill] 실패", error);
	}
}
