import { sql } from "drizzle-orm";
import { getEnv } from "../config/env.ts";

import type { getDb } from "../db/client.ts";
import type { Interval } from "../domain/presence.ts";
import { buildStats, type PersonIntervals, type Stats } from "../domain/stats.ts";
import { findSnapshots, type SnapshotRow } from "./snapshot.ts";
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
 * 기간 뒤로도 얼마나 더 볼지.
 *
 * 구간의 끝은 **다음 이벤트**(left)로 정해진다. 그 이벤트가 창 밖이면
 * lead() 가 null 을 주고 구간이 열린 것처럼 보인다 — 밤을 넘겨 끝난 접속이
 * 통째로 짧아진다.
 *
 * 하루치만 다시 셀 때 이게 드러났다. 같은 날을 14일 창에서 셀 때와 하루 창에서
 * 셀 때 20시간 넘게 달랐다. 세는 범위와 읽는 범위는 다르다.
 */
const LOOKAHEAD_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

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
export async function findIntervalsInRange(
	db: Db,
	from: Date,
	to: Date,
): Promise<PersonIntervals[]> {
	// 원시 SQL 파라미터는 문자열로 넘긴다. 드라이버가 Date 객체를 그대로
	// 바인딩하지 못한다. ISO 문자열이면 Postgres 가 timestamptz 로 읽는다.
	const lookbehind = new Date(
		from.getTime() - LOOKBEHIND_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
	const until = new Date(
		to.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();

	const rows = await db.execute<{
		display_name: string | null;
		meeting_uuid: string;
		started_at: string | Date;
		ended_at: string | Date | null;
	}>(sql`
		select
			p.display_name,
			t.meeting_uuid,
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

	const [aliases, sessionEnds] = await Promise.all([
		loadAliasMap(db),
		findSessionEnds(db),
	]);

	const byName = new Map<string, Interval[]>();
	// 봇은 사람이 아니다. 체류 시간 통계에 끼면 1등이 봇이 된다.
	const botNames = getEnv().BOT_NAMES;

	for (const row of rows) {
		const raw = row.display_name;
		if (raw !== null && botNames.includes(raw)) continue;
		const name = raw ? (aliases.get(raw) ?? raw) : "이름 없음";
		const list = byName.get(name) ?? [];

		list.push({
			start: new Date(row.started_at),
			end:
				row.ended_at === null
					? closeOpen(new Date(row.started_at), sessionEnds.get(row.meeting_uuid))
					: new Date(row.ended_at),
		});
		byName.set(name, list);
	}

	return Array.from(byName.entries()).map(([displayName, intervals]) => ({
		displayName,
		intervals,
	}));
}

/** 회의 세션이 언제 끝났는가. 아직 안 끝났으면 null. */
export interface SessionEnd {
	/** meeting.ended 웹훅이 알려준 종료 시각. 못 받았으면 null. */
	endedAt: Date | null;
	/** 그 세션에서 마지막으로 온 이벤트. 종료를 못 받았을 때의 대안이다. */
	lastEventAt: Date;
}

/**
 * 세션이 아직 살아 있다고 볼 수 있는 시간.
 *
 * 종료 웹훅을 못 받았고 이 시간 안에 이벤트가 있었으면 회의가 진행 중이라고
 * 본다. 그보다 오래됐으면 끝난 것으로 보고 마지막 이벤트에서 끊는다.
 */
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

async function findSessionEnds(db: Db): Promise<Map<string, SessionEnd>> {
	const rows = await db.execute<{
		meeting_uuid: string;
		ended_at: string | null;
		last_event_at: string | Date;
	}>(sql`
		select
			e.meeting_uuid,
			x.ended_at,
			e.last_event_at
		from (
			select meeting_uuid, max(occurred_at) as last_event_at
			from participant_events
			group by meeting_uuid
		) e
		left join (
			select
				payload->'payload'->'object'->>'uuid' as meeting_uuid,
				min(payload->'payload'->'object'->>'end_time') as ended_at
			from webhook_events
			where payload->>'event' = 'meeting.ended'
			group by 1
		) x on x.meeting_uuid = e.meeting_uuid
	`);

	return new Map(
		rows.map((row) => [
			row.meeting_uuid,
			{
				endedAt: row.ended_at === null ? null : new Date(row.ended_at),
				lastEventAt: new Date(row.last_event_at),
			},
		]),
	);
}

/**
 * 퇴장 이벤트를 못 받은 구간을 어디서 끊을 것인가.
 *
 * 그대로 두면 "아직 접속 중" 으로 보여 지금까지의 시간이 전부 더해진다.
 * 실제로 9월 4일에 열린 채로 남은 구간 하나가 134시간으로 잡혀 순위를
 * 통째로 뒤집었다. 놓친 퇴장은 접속이 아니다.
 *
 * 회의가 끝난 시각에서 끊는다. 종료 웹훅을 못 받았으면 그 세션의 마지막
 * 이벤트에서 끊는다. 둘 다 없거나 회의가 아직 진행 중이면 열어 둔다 —
 * 그때는 정말로 접속해 있는 것이다.
 *
 * 실제보다 적게 잡힐 수는 있어도 없는 시간을 만들지는 않는다.
 * findIntervals 가 세운 원칙과 같다.
 */
export function closeOpen(startedAt: Date, session: SessionEnd | undefined): Date | null {
	if (!session) return null;

	// 종료를 못 받았고 최근까지 이벤트가 있으면 진행 중이다. 정말로 접속해 있다.
	const live =
		session.endedAt === null &&
		Date.now() - session.lastEventAt.getTime() < LIVE_WINDOW_MS;

	if (live) return null;

	const end = session.endedAt ?? session.lastEventAt;

	// 끝난 뒤에 들어온 뒤늦은 이벤트가 있다. 실제로 회의 종료(02:30)보다
	// 10분 늦게 도착한 입장(02:40)을 봤다. 이때 열어 두면 "아직 접속 중" 이
	// 되어 지금까지의 시간이 전부 더해진다 — 가장 나쁜 쪽이다.
	// 길이 0 으로 닫는다. 그런 구간은 합칠 때 걸러진다.
	return end > startedAt ? end : startedAt;
}

/**
 * 최근 며칠의 통계.
 *
 * 오늘은 아직 끝나지 않았으므로 함께 넣는다 — "지금까지" 로 읽으면 된다.
 */
/**
 * 고른 기간의 통계.
 *
 * `fromDate`, `toDate` 는 한국 시간 기준 YYYY-MM-DD 이고 **양끝을 포함한다** —
 * "9월 1일부터 9월 30일까지" 라고 말했으면 30일도 들어가야 한다.
 */
export async function getStats(
	db: Db,
	fromDate: string,
	toDate: string,
	now: Date = new Date(),
): Promise<Stats> {
	const from = new Date(`${fromDate}T00:00:00+09:00`);
	// 끝나는 날의 다음 자정까지가 그날을 포함하는 범위다
	const to = new Date(new Date(`${toDate}T00:00:00+09:00`).getTime() + DAY_MS);

	// 직전 같은 길이의 기간까지 읽어야 견줄 수 있다.
	// 화면에 그리는 범위와 읽어오는 범위가 다르다.
	const span = to.getTime() - from.getTime();
	const loadFrom = new Date(from.getTime() - span);

	const people = await findIntervalsInRange(db, loadFrom, to);
	const stats = buildStats(people, from, to, now);

	return fillFromSnapshots(stats, await findSnapshots(db, stats.from));
}

export interface DayDetail {
	date: string;
	/** 그날 한 번이라도 들어온 사람 */
	people: { displayName: string; seconds: number }[];
	/** 그 순간 가장 많이 모였던 인원 */
	peak: number;
	totalSeconds: number;
	/** 그 밤의 첫 입장 / 마지막 퇴장. HH:MM */
	firstAt: string | null;
	lastAt: string | null;
}

/**
 * 하루치 참가자 목록.
 *
 * 통계가 아니라 **그날의 화면**이다. 현재 접속자 목록과 같은 모양으로 그리려고
 * 사람과 시간만 준다.
 *
 * 앞뒤로 하루씩 넓게 세고 가운데 날만 꺼낸다. 하루 창으로 세면 밤을 넘긴
 * 구간이 자정에서 잘린다 — snapshotDay 와 같은 이유다.
 */
export async function getDayDetail(db: Db, date: string): Promise<DayDetail> {
	const midnight = new Date(`${date}T00:00:00+09:00`).getTime();
	const from = new Date(midnight - DAY_MS);
	const to = new Date(midnight + 2 * DAY_MS);

	const loaded = await findIntervalsInRange(db, from, to);

	// 사람별 시간은 그 하루만 세야 한다. 넓게 센 값을 쓰면 앞뒤 날이 섞인다.
	const day = new Date(midnight);
	const nextDay = new Date(midnight + DAY_MS);
	const stats = buildStats(loaded, day, nextDay, new Date());
	const bucket = buildStats(loaded, from, to, new Date()).days.find(
		(d) => d.date === date,
	);

	return {
		date,
		people: stats.people.map((p) => ({
			displayName: p.displayName,
			seconds: p.seconds,
		})),
		peak: bucket?.peak ?? 0,
		totalSeconds: stats.totalSeconds,
		firstAt: bucket?.firstAt ?? null,
		lastAt: bucket?.lastAt ?? null,
	};
}

/**
 * 원본 이벤트가 없는 날을 저장된 기록으로 채운다.
 *
 * 지금은 이벤트를 지우지 않으므로 채울 일이 거의 없다. 나중에 원본을
 * 정리하더라도 날짜별 막대는 계속 보이라고 두는 길이다.
 *
 * **채운 날은 날짜별 합계에만 들어간다.** 시간대·요일·사람은 구간을 다시
 * 쪼개야 나오는 값이라 스냅샷만으로는 만들 수 없다. 그래서 그 구역들은
 * 원본이 남아 있는 기간만 말한다 — 상세는 docs/stats.md.
 */
export function fillFromSnapshots(stats: Stats, snapshots: SnapshotRow[]): Stats {
	const byDate = new Map(snapshots.map((row) => [row.date, row]));
	let added = 0;

	const days = stats.days.map((day) => {
		// 원본에서 나온 값이 있으면 그쪽이 진실이다. 스냅샷은 그것을 굳힌 것뿐이다.
		if (day.seconds > 0) return day;

		const saved = byDate.get(day.date);
		if (!saved || saved.seconds === 0) return day;

		added += saved.seconds;

		return {
			date: day.date,
			people: saved.people,
			seconds: saved.seconds,
			peak: saved.peak,
			firstAt: saved.firstAt,
			lastAt: saved.lastAt,
		};
	});

	if (added === 0) return stats;

	return { ...stats, days, totalSeconds: stats.totalSeconds + added };
}

/** 테스트에서 부르는 이름. 이 판단만 따로 시험한다. */
export { closeOpen as closeOpenForTest };

/** 테스트에서 부르는 이름. 채우는 판단만 따로 시험한다. */
export { fillFromSnapshots as fillFromSnapshotsForTest };
