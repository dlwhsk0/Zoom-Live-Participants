/**
 * Report API 로 놓친 입퇴장을 손으로 메꾼다.
 *
 * 서버가 매일 04:30 에 같은 일을 하지만(src/jobs/backfill.ts), 방금 생긴
 * 공백을 바로 메꾸거나 오래된 세션을 소급할 때 쓴다. 끝난 세션만 된다 —
 * 진행 중인 세션은 Report API 에 아직 없다.
 *
 * 기본은 미리보기다. 무엇을 넣을지 보여주기만 한다.
 *
 * 실행:
 *   pnpm backfill:report                         최근 7일, 미리보기
 *   pnpm backfill:report -- --since 2026-10-22   이 날짜(KST) 이후 시작한 세션
 *   pnpm backfill:report -- --until 2026-10-23   이 날짜(KST) 전에 시작한 세션
 *   pnpm backfill:report -- --yes                실제로 넣는다
 *   pnpm backfill:report -- --force              맞춤 비율 검사를 건너뛴다
 */
import { getEnv } from "../src/config/env.ts";
import { closeDb, getDb } from "../src/db/client.ts";
import { DAILY_LOOKBACK_DAYS, runReportBackfill } from "../src/jobs/backfill.ts";
import {
	createZoomReportClient,
	zoomCredentialsFrom,
} from "../src/zoom/report-api.ts";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
	const at = args.indexOf(name);
	return at >= 0 ? args[at + 1] : undefined;
};

/** YYYY-MM-DD 를 그날 한국 시간 0시로 읽는다. */
function kstDate(raw: string | undefined, name: string): Date | undefined {
	if (!raw) return undefined;
	const at = new Date(`${raw}T00:00:00+09:00`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(at.getTime())) {
		console.error(`${name} 은 YYYY-MM-DD 여야 합니다: ${raw}`);
		process.exit(1);
	}
	return at;
}

const env = getEnv();
const credentials = zoomCredentialsFrom(env);
if (!credentials || !env.ZOOM_MEETING_ID) {
	console.error(
		"ZOOM_ACCOUNT_ID · ZOOM_CLIENT_ID · ZOOM_CLIENT_SECRET · ZOOM_MEETING_ID 가 필요합니다",
	);
	process.exit(1);
}

const apply = flag("--yes");
const since =
	kstDate(value("--since"), "--since") ??
	new Date(Date.now() - DAILY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
const until = kstDate(value("--until"), "--until");

const kst = (at: Date) =>
	new Date(at.getTime() + 9 * 3600_000).toISOString().slice(0, 19).replace("T", " ");

const db = getDb();

try {
	console.log(
		`${kst(since)} 이후${until ? ` ${kst(until)} 이전` : ""} 시작한 세션을 봅니다` +
			(apply ? "." : " (미리보기 — 넣으려면 --yes)."),
	);

	const results = await runReportBackfill({
		db,
		zoom: createZoomReportClient(credentials),
		meetingId: env.ZOOM_MEETING_ID,
		since,
		until,
		apply,
		force: flag("--force"),
	});

	for (const r of results) {
		const plan = r.plan;
		const summary = plan
			? `구간 이벤트 ${plan.reportEvents} · 이미 있음 ${plan.matched} · 빠짐 ${plan.planned}` +
				` · 받던 시각 맞춤 ${plan.receivingMatched}/${plan.receiving}`
			: "";
		console.log(`\n${kst(r.startTime)} 시작  ${r.meetingUuid}\n  ${summary}`);

		if (r.error) console.log(`  ⚠ ${r.error}`);

		for (const e of r.events) {
			console.log(
				`    ${kst(e.at)}  ${e.eventType.padEnd(6)}  ${e.name ?? "(이름 없음)"}` +
					(e.anchored ? "" : "  [웹훅에 잇지 못함]"),
			);
		}
		if (apply && r.inserted > 0) console.log(`  → ${r.inserted}건 넣음`);
	}

	const total = results.reduce(
		(sum, r) => sum + (apply ? r.inserted : r.events.length),
		0,
	);
	console.log(
		`\n세션 ${results.length}개, ${apply ? "넣은" : "넣을"} 이벤트 ${total}건.`,
	);
} finally {
	await closeDb();
}
