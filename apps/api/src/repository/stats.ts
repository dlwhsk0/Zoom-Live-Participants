import { sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import type { Interval } from "../domain/presence.ts";
import { buildStats, type PersonIntervals, type Stats } from "../domain/stats.ts";
import { loadAliasMap } from "./query.ts";

type Db = ReturnType<typeof getDb>;

/**
 * 기간 밖에서 시작한 구간을 얼마나 거슬러 찾을지.
 *
 * 밤을 넘겨 이어 있는 접속을 놓치지 않으려면 시작 이벤트를 기간보다 앞에서도
 * 봐야 한다. 하루면 충분하다 — 24시간 넘게 켜 둔 접속은 실제로 없었고,
 * 있더라도 그만큼만 덜 세어진다(없는 시간을 만들지는 않는다).
 */
const LOOKBEHIND_DAYS = 1;

/**
 * 여러 회의 세션에 걸쳐 사람별 접속 구간을 모은다.
 *
 * 화면의 현재 접속자 조회(query.ts)는 한 세션만 본다. 통계는 날짜를 가로지르고
 * 세션도 여러 개라 따로 읽는다.
 *
 * **사람은 표시 이름으로 묶는다.** participant_uuid 는 접속마다 새로 발급되어
 * 같은 사람이 세션마다 다른 값을 갖는다. 별칭까지 적용한 이름이 세션을 넘어
 * 같은 사람을 가리키는 유일한 열쇠다.
 */
async function findIntervalsInRange(
	db: Db,
	from: Date,
	to: Date,
): Promise<PersonIntervals[]> {
	// 원시 SQL 파라미터는 문자열로 넘긴다. 드라이버가 Date 객체를 그대로
	// 바인딩하지 못한다. ISO 문자열이면 Postgres 가 timestamptz 로 읽는다.
	const lookbehind = new Date(
		from.getTime() - LOOKBEHIND_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
	const until = to.toISOString();

	const rows = await db.execute<{
		display_name: string | null;
		started_at: string | Date;
		ended_at: string | Date | null;
	}>(sql`
		select
			p.display_name,
			t.started_at,
			t.ended_at
		from (
			select
				meeting_uuid,
				participant_uuid,
				occurred_at as started_at,
				event_type,
				lead(event_type) over w as next_type,
				case
					when lead(event_type) over w = 'left'
					then lead(occurred_at) over w
				end as ended_at
			from participant_events
			where occurred_at >= ${lookbehind}
				and occurred_at < ${until}
			window w as (
				partition by meeting_uuid, participant_uuid
				order by occurred_at, case when event_type = 'left' then 0 else 1 end
			)
		) t
		join participants p
			on p.meeting_uuid = t.meeting_uuid
			and p.participant_uuid = t.participant_uuid
		where t.event_type = 'joined'
			and (t.next_type is null or t.next_type = 'left')
	`);

	const aliases = await loadAliasMap(db);
	const byName = new Map<string, Interval[]>();

	for (const row of rows) {
		const raw = row.display_name;
		const name = raw ? (aliases.get(raw) ?? raw) : "이름 없음";
		const list = byName.get(name) ?? [];

		list.push({
			start: new Date(row.started_at),
			end: row.ended_at === null ? null : new Date(row.ended_at),
		});
		byName.set(name, list);
	}

	return Array.from(byName.entries()).map(([displayName, intervals]) => ({
		displayName,
		intervals,
	}));
}

/**
 * 최근 며칠의 통계.
 *
 * 오늘은 아직 끝나지 않았으므로 함께 넣는다 — "지금까지" 로 읽으면 된다.
 */
export async function getStats(
	db: Db,
	days: number,
	now: Date = new Date(),
): Promise<Stats> {
	const DAY_MS = 24 * 60 * 60 * 1000;
	const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

	// 오늘 자정(한국 시간)을 기준으로 days 일 전부터 내일 자정까지
	const shifted = now.getTime() + KST_OFFSET_MS;
	const todayMidnight = shifted - (shifted % DAY_MS) - KST_OFFSET_MS;

	const from = new Date(todayMidnight - (days - 1) * DAY_MS);
	const to = new Date(todayMidnight + DAY_MS);

	// 주간 비교는 보고 있는 기간보다 앞(최대 14일)을 봐야 한다.
	// 화면에 그리는 범위와 읽어오는 범위가 다르다.
	const loadFrom = new Date(Math.min(from.getTime(), todayMidnight - 14 * DAY_MS));
	const people = await findIntervalsInRange(db, loadFrom, to);

	return buildStats(people, from, to, now);
}
