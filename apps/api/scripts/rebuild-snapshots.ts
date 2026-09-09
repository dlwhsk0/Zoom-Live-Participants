/**
 * 일별 스냅샷을 다시 만든다.
 *
 * 스냅샷은 캐시이지 원장이 아니다. 세는 규칙이 바뀌면 여기로 다시 만든다 —
 * 실제로 퇴장을 못 받은 구간 처리를 고치면서 숫자가 통째로 바뀐 적이 있다.
 *
 * 실행:
 *   node --env-file=../../.env --experimental-strip-types scripts/rebuild-snapshots.ts [일수]
 */
import { closeDb, getDb } from "../src/db/client.ts";
import { snapshotDay } from "../src/repository/snapshot.ts";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const days = Number(args[0] ?? 30);

if (!Number.isInteger(days) || days < 1 || days > 365) {
	console.error("일수는 1~365 사이 정수입니다");
	process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const db = getDb();

try {
	const shifted = Date.now() + KST_OFFSET_MS;
	const todayMidnight = shifted - (shifted % DAY_MS) - KST_OFFSET_MS;

	console.log(`최근 ${days}일을 다시 셉니다.`);

	for (let i = days - 1; i >= 0; i--) {
		const date = new Date(todayMidnight - i * DAY_MS + KST_OFFSET_MS)
			.toISOString()
			.slice(0, 10);

		const bucket = await snapshotDay(db, date);
		const hours = (bucket.seconds / 3600).toFixed(1);

		// 아무도 없던 날은 조용히 넘긴다. 줄만 늘어난다.
		if (bucket.seconds > 0) {
			console.log(
				`  ${date}  ${String(bucket.people).padStart(3)}명  ${hours.padStart(7)}시간  최대 ${bucket.peak}`,
			);
		}
	}

	console.log("끝났습니다.");
} finally {
	await closeDb();
}
