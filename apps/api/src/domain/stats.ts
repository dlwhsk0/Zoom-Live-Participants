import { mergeIntervals, type Interval, type Range } from "./presence.ts";

/**
 * 접속 기록을 날짜·시간대·사람으로 나눠 담는다.
 *
 * 순수 함수만 둔다. DB 는 repository/stats.ts 가 읽고, 여기서는 구간만 받는다.
 *
 * ## 겹침을 먼저 누른다
 *
 * 노트북과 폰으로 동시에 접속하면 구간이 겹친다. **쪼개기 전에 사람별로
 * 먼저 합친다.** 겹친 채로 시간대에 나눠 담으면 같은 시간이 두 번 세어진다.
 *
 * ## 시간대는 한국 시간 기준이다
 *
 * "새벽 2시에 많다" 는 보는 사람의 시간대로 말해야 뜻이 통한다. UTC 로
 * 담으면 9시간 밀린다. 한국은 서머타임이 없어 +9 로 고정해도 안전하다 —
 * 시간대 데이터베이스를 끌어오지 않고 이 상수 하나로 끝낸다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface PersonIntervals {
	/** 표시 이름. 별칭까지 적용된 뒤의 값이다. */
	displayName: string | null;
	intervals: readonly Interval[];
}

export interface DayBucket {
	/** YYYY-MM-DD (한국 시간) */
	date: string;
	/** 그날 한 번이라도 들어온 사람 수 */
	people: number;
	/** 그날 머문 시간의 합(초). 사람별로 겹침을 누른 뒤 더한 값이다. */
	seconds: number;
	/** 그 순간 가장 많이 모였던 인원 */
	peak: number;
	/**
	 * 그날 가장 먼저 들어온 시각 / 마지막으로 나간 시각. HH:MM (한국 시간).
	 *
	 * **그날 안에서 시작한 구간**만 본다. 전날 밤부터 이어져 온 접속을
	 * 그날의 시작으로 치면 매일 00:00 이 되어 아무 뜻이 없다.
	 */
	firstAt: string | null;
	lastAt: string | null;
}

export interface HourBucket {
	/** 0~23 (한국 시간) */
	hour: number;
	seconds: number;
}

export interface WeekdayBucket {
	/** 0=일 … 6=토 */
	weekday: number;
	seconds: number;
	/** 이 요일이 기간 안에 몇 번 있었나. 평균을 내려면 필요하다. */
	days: number;
}

export interface PersonStat {
	displayName: string;
	seconds: number;
	/** 며칠 나왔나 */
	days: number;
	/**
	 * 최근 연속 출석일. 마지막으로 나온 날에서 거슬러 이어진 길이다.
	 *
	 * `streakAlive` 가 false 면 이미 끊긴 기록이다 — 마지막 출석이
	 * 오늘도 어제도 아니라는 뜻. 화면에서 "N일 연속" 이라고 부르면 안 된다.
	 */
	streak: number;
	streakAlive: boolean;
	/** 기간 안에서 가장 길었던 연속 출석 */
	bestStreak: number;
	/** 날짜별 시간. 개인 상세에서 쓴다. */
	daily: { date: string; seconds: number }[];
}

/**
 * 최근 7일과 그 앞 7일.
 *
 * 오늘은 빼고 어제까지로 자른다. 오늘은 아직 끝나지 않아서 넣으면
 * 이번 주가 늘 지는 것처럼 보인다.
 */
export interface WeekComparison {
	recent: { seconds: number; people: number };
	previous: { seconds: number; people: number };
}

export interface Stats {
	from: string;
	to: string;
	days: DayBucket[];
	hours: HourBucket[];
	weekdays: WeekdayBucket[];
	people: PersonStat[];
	week: WeekComparison;
	/** 보통 몇 시에 시작해서 몇 시에 끝나는가. 날짜별 값의 중앙값이다. */
	typicalStart: string | null;
	typicalEnd: string | null;
	/** 기간 전체 합계 */
	totalSeconds: number;
	/** 기간에 한 번이라도 나온 사람 수 */
	totalPeople: number;
}

/** 한국 시간 기준 날짜 문자열. */
export function kstDate(ms: number): string {
	return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 한국 시간 기준 0~23 시. */
export function kstHour(ms: number): number {
	return new Date(ms + KST_OFFSET_MS).getUTCHours();
}

/** 한국 시간 기준 요일. 0=일 … 6=토 */
export function kstWeekday(ms: number): number {
	return new Date(ms + KST_OFFSET_MS).getUTCDay();
}

/** 한국 시간 그날 0시의 UTC 밀리초. */
function kstMidnight(ms: number): number {
	const shifted = ms + KST_OFFSET_MS;
	return shifted - (shifted % DAY_MS) - KST_OFFSET_MS;
}

/** 두 구간이 겹치는 부분. 겹치지 않으면 null. */
function clip(range: Range, from: number, to: number): Range | null {
	const start = Math.max(range.from, from);
	const end = Math.min(range.to, to);

	return end > start ? { from: start, to: end } : null;
}

/**
 * 구간을 경계마다 잘라 (칸, 초) 로 나눠 담는다.
 *
 * 22시 30분부터 다음날 1시 15분까지 있었다면 22·23·0·1 시에 나눠 담긴다.
 * 시작한 시각에만 몰아 담으면 "몇 시에 많은지" 가 아니라 "몇 시에 들어오는지"
 * 가 된다. 우리가 알고 싶은 것은 앞쪽이다.
 */
function spreadByHour(
	range: Range,
	add: (hour: number, seconds: number) => void,
): void {
	let cursor = range.from;

	while (cursor < range.to) {
		// 지금 커서가 속한 시의 끝
		const shifted = cursor + KST_OFFSET_MS;
		const boundary = shifted - (shifted % HOUR_MS) + HOUR_MS - KST_OFFSET_MS;
		const end = Math.min(boundary, range.to);

		add(kstHour(cursor), Math.round((end - cursor) / 1000));
		cursor = end;
	}
}

/** 한국 시간 HH:MM. */
function kstClock(ms: number): string {
	const d = new Date(ms + KST_OFFSET_MS);
	return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** 하루 차이인가. 날짜 문자열로 비교한다. */
function isNextDay(earlier: string, later: string): boolean {
	return kstDate(Date.parse(`${earlier}T00:00:00Z`) + DAY_MS) === later;
}

/**
 * 연속 출석을 센다.
 *
 * 마지막으로 나온 날에서 거슬러 이어진 길이가 `streak`,
 * 기간 안에서 가장 길었던 것이 `best` 다.
 */
export function streakOf(
	dates: readonly string[],
	today: string,
): { streak: number; alive: boolean; best: number } {
	if (dates.length === 0) return { streak: 0, alive: false, best: 0 };

	const sorted = [...new Set(dates)].sort();

	let best = 1;
	let run = 1;
	let tailRun = 1;

	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1] ?? "";
		const cur = sorted[i] ?? "";

		run = isNextDay(prev, cur) ? run + 1 : 1;
		if (run > best) best = run;
		tailRun = run;
	}

	const last = sorted[sorted.length - 1] ?? "";
	const yesterday = kstDate(Date.parse(`${today}T00:00:00Z`) - DAY_MS);

	// 오늘도 어제도 아니면 이미 끊긴 기록이다
	return { streak: tailRun, alive: last === today || last === yesterday, best };
}

/** 중앙값. 빈 목록이면 null. */
function median(values: readonly string[]): string | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort();
	return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/** 동시에 가장 많이 모였던 인원. 사람별로 이미 합쳐진 구간을 받는다. */
export function peakConcurrent(ranges: readonly Range[]): number {
	const points = ranges
		.flatMap((r) => [
			{ at: r.from, delta: 1 },
			{ at: r.to, delta: -1 },
		])
		// 같은 시각이면 나가는 쪽을 먼저 본다. 교대는 겹침이 아니다.
		.sort((a, b) => a.at - b.at || a.delta - b.delta);

	let now = 0;
	let peak = 0;

	for (const p of points) {
		now += p.delta;
		if (now > peak) peak = now;
	}

	return peak;
}

/** 창 안에 든 시간과 사람 수. 이미 합쳐진 구간을 받는다. */
function sumWindow(
	merged: readonly { displayName: string; ranges: Range[] }[],
	from: number,
	to: number,
): { seconds: number; people: number } {
	let seconds = 0;
	const people = new Set<string>();

	for (const person of merged) {
		for (const range of person.ranges) {
			const cut = clip(range, from, to);
			if (!cut) continue;

			seconds += Math.round((cut.to - cut.from) / 1000);
			people.add(person.displayName);
		}
	}

	return { seconds, people: people.size };
}

/**
 * 통계를 낸다.
 *
 * `from` 이상 `to` 미만의 구간만 센다. 걸쳐 있는 구간은 잘라서 담는다 —
 * 어제까지를 보는데 오늘 새벽에 이어 있던 시간이 어제로 딸려오면 안 된다.
 */
export function buildStats(
	people: readonly PersonIntervals[],
	from: Date,
	to: Date,
	now: Date,
): Stats {
	const fromMs = from.getTime();
	const toMs = to.getTime();

	// 1) 사람별로 먼저 합친다. 이 뒤로는 겹침을 신경 쓰지 않아도 된다.
	//
	//    자르지 않은 것을 따로 들고 있는다. 주간 비교는 보고 있는 기간보다
	//    앞을 봐야 하는데, 여기서 잘라 버리면 "그 앞 7일" 이 늘 0 이 된다.
	const all = people.map((person) => ({
		displayName: person.displayName ?? "이름 없음",
		ranges: mergeIntervals(person.intervals, now),
	}));

	const merged = all.map((person) => ({
		displayName: person.displayName,
		ranges: person.ranges
			.map((r) => clip(r, fromMs, toMs))
			.filter((r): r is Range => r !== null),
	}));

	// 연속 출석은 보고 있는 기간에 갇히면 안 된다. 7일만 보는 중이라고
	// 11일 연속이 7일로 줄어들면 그건 다른 사실이다. 읽어온 만큼 다 센다.
	const attendedAll = new Map<string, Set<string>>();

	for (const person of all) {
		const dates = attendedAll.get(person.displayName) ?? new Set<string>();

		for (const range of person.ranges) {
			for (let d = kstMidnight(range.from); d < range.to; d += DAY_MS) {
				dates.add(kstDate(d));
			}
		}

		attendedAll.set(person.displayName, dates);
	}

	const hours = new Map<number, number>();
	const weekdaySeconds = new Map<number, number>();
	const dayTotals = new Map<string, number>();
	const dayPeople = new Map<string, Set<string>>();
	const dayRanges = new Map<string, Range[]>();
	const dayFirst = new Map<string, number>();
	const dayLast = new Map<string, number>();
	const personTotals = new Map<
		string,
		{ seconds: number; daily: Map<string, number> }
	>();

	for (const person of merged) {
		const stat = personTotals.get(person.displayName) ?? {
			seconds: 0,
			daily: new Map<string, number>(),
		};

		for (const range of person.ranges) {
			// 그날 안에서 시작·종료한 것만 그날의 첫/마지막으로 친다.
			// 전날부터 이어져 온 접속을 그날의 시작으로 치면 매일 00:00 이 된다.
			const startDay = kstDate(range.from);
			const prevFirst = dayFirst.get(startDay);
			if (prevFirst === undefined || range.from < prevFirst) {
				dayFirst.set(startDay, range.from);
			}

			const endDay = kstDate(range.to);
			const prevLast = dayLast.get(endDay);
			if (prevLast === undefined || range.to > prevLast) {
				dayLast.set(endDay, range.to);
			}

			// 시간대: 시 경계마다 잘라 담는다
			spreadByHour(range, (hour, seconds) => {
				hours.set(hour, (hours.get(hour) ?? 0) + seconds);
			});

			// 날짜별: 자정 경계마다 자른다. 키가 문자열이라 따로 돈다.
			let cursor = range.from;
			while (cursor < range.to) {
				const boundary = kstMidnight(cursor) + DAY_MS;
				const end = Math.min(boundary, range.to);
				const key = kstDate(cursor);
				const weekday = kstWeekday(cursor);
				const seconds = Math.round((end - cursor) / 1000);

				dayTotals.set(key, (dayTotals.get(key) ?? 0) + seconds);
				weekdaySeconds.set(weekday, (weekdaySeconds.get(weekday) ?? 0) + seconds);

				const set = dayPeople.get(key) ?? new Set<string>();
				set.add(person.displayName);
				dayPeople.set(key, set);

				const list = dayRanges.get(key) ?? [];
				list.push({ from: cursor, to: end });
				dayRanges.set(key, list);

				stat.seconds += seconds;
				stat.daily.set(key, (stat.daily.get(key) ?? 0) + seconds);
				cursor = end;
			}
		}

		personTotals.set(person.displayName, stat);
	}

	// 2) 기간 안의 모든 날짜를 만든다. 아무도 안 온 날도 0 으로 보여야
	//    "그날은 비었다" 가 드러난다.
	const days: DayBucket[] = [];
	const weekdayCount = new Map<number, number>();

	for (let d = kstMidnight(fromMs); d < toMs; d += DAY_MS) {
		const key = kstDate(d);
		weekdayCount.set(kstWeekday(d), (weekdayCount.get(kstWeekday(d)) ?? 0) + 1);

		const first = dayFirst.get(key);
		const last = dayLast.get(key);

		days.push({
			date: key,
			people: dayPeople.get(key)?.size ?? 0,
			seconds: dayTotals.get(key) ?? 0,
			peak: peakConcurrent(dayRanges.get(key) ?? []),
			firstAt: first === undefined ? null : kstClock(first),
			lastAt: last === undefined ? null : kstClock(last),
		});
	}

	// 최근 7일과 그 앞 7일. 오늘은 아직 끝나지 않아서 뺀다.
	const todayMidnight = kstMidnight(now.getTime());
	const week = {
		recent: sumWindow(all, todayMidnight - 7 * DAY_MS, todayMidnight),
		previous: sumWindow(all, todayMidnight - 14 * DAY_MS, todayMidnight - 7 * DAY_MS),
	};

	const today = kstDate(now.getTime());

	return {
		from: kstDate(fromMs),
		to: kstDate(toMs - 1),
		days,
		hours: Array.from({ length: 24 }, (_, hour) => ({
			hour,
			seconds: hours.get(hour) ?? 0,
		})),
		weekdays: Array.from({ length: 7 }, (_, weekday) => ({
			weekday,
			seconds: weekdaySeconds.get(weekday) ?? 0,
			days: weekdayCount.get(weekday) ?? 0,
		})),
		week,
		typicalStart: median(
			days.map((d) => d.firstAt).filter((v): v is string => v !== null),
		),
		typicalEnd: median(
			days.map((d) => d.lastAt).filter((v): v is string => v !== null),
		),
		people: Array.from(personTotals.entries())
			.map(([displayName, s]) => {
				const run = streakOf(
					Array.from(attendedAll.get(displayName) ?? []),
					today,
				);

				return {
					displayName,
					seconds: s.seconds,
					days: s.daily.size,
					streak: run.streak,
					streakAlive: run.alive,
					bestStreak: run.best,
					daily: Array.from(s.daily.entries())
						.map(([date, seconds]) => ({ date, seconds }))
						.sort((a, b) => a.date.localeCompare(b.date)),
				};
			})
			.filter((p) => p.seconds > 0)
			.sort((a, b) => b.seconds - a.seconds),
		totalSeconds: Array.from(dayTotals.values()).reduce((a, b) => a + b, 0),
		totalPeople: new Set(
			Array.from(dayPeople.values()).flatMap((set) => Array.from(set)),
		).size,
	};
}
