import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchStats, type PersonStat, type Stats as StatsData } from "./api.ts";
import { studyTier } from "./format.ts";
import Columns from "./Columns.tsx";
import DayView from "./DayView.tsx";
import PersonDialog from "./PersonDialog.tsx";
import StudyIcon from "./StudyIcon.tsx";
import ThemeToggle from "./ThemeToggle.tsx";

/** 최상위. 하는 일이 다르다 — 하나는 그날의 화면, 하나는 기간의 통계다. */
type Mode = "day" | "stats";

const MODES: { id: Mode; label: string }[] = [
	{ id: "day", label: "스냅샷" },
	{ id: "stats", label: "통계" },
];

/** 통계를 무슨 단위로 볼지. 이것이 통계의 최상위다. */
type View = "weeks" | "months";

const VIEWS: { id: View; label: string }[] = [
	{ id: "weeks", label: "주별" },
	{ id: "months", label: "월별" },
];

/** 주별은 최근 한 달, 월별은 한 분기쯤 본다. */
const VIEW_DAYS: Record<View, number> = { weeks: 30, months: 90 };
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const MEDAL = ["🥇", "🥈", "🥉"];

/** 통계는 시간 단위로 읽는다. 초까지 보여줄 이유가 없다. */
export function hours(seconds: number): string {
	if (seconds === 0) return "0";
	// 30초 남짓 있다 나간 사람이 "0분" 으로 뜨면 고장으로 읽힌다
	if (seconds < 60) return "1분 미만";
	if (seconds < 3600) return `${Math.round(seconds / 60)}분`;

	const h = seconds / 3600;
	return h >= 10 ? `${Math.round(h)}시간` : `${h.toFixed(1)}시간`;
}

/** 09-08 (월) */
function dayLabel(date: string): string {
	const d = new Date(`${date}T00:00:00+09:00`);
	return `${date.slice(5)} (${WEEKDAY[d.getUTCDay()] ?? ""})`;
}

/** 주는 시작일로, 달은 그대로 읽는다. */
function periodLabel(key: string): string {
	return key.length === 7 ? `${Number(key.slice(5))}월` : `${key.slice(5)} 주`;
}

function Bar({
	label,
	value,
	max,
	suffix,
	note,
	dim,
}: {
	label: string;
	value: number;
	max: number;
	suffix?: string;
	note?: string;
	dim?: boolean;
}) {
	return (
		<li className={dim ? "chart__row chart__row--dim" : "chart__row"}>
			<span className="chart__label">{label}</span>
			<span className="chart__track">
				<span
					className="chart__fill"
					style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
				/>
			</span>
			<span className="chart__value">
				{hours(value)}
				{suffix && <span className="chart__suffix">{suffix}</span>}
			</span>
			{note && <span className="chart__note">{note}</span>}
		</li>
	);
}



/** 지난 7일과 그 앞 7일. 늘었으면 위, 줄었으면 아래. */
function WeekCard({ week }: { week: StatsData["week"] | undefined }) {
	// 웹은 즉시 배포되고 API 는 수동이다. 그 사이에 옛 응답이 올 수 있으므로
	// 없는 필드를 읽고 화면 전체가 죽는 일은 없어야 한다.
	if (!week) return null;

	const { recent, previous } = week;

	if (recent.seconds === 0 && previous.seconds === 0) return null;

	const diff = previous.seconds > 0
		? Math.round(((recent.seconds - previous.seconds) / previous.seconds) * 100)
		: null;

	const up = diff !== null && diff > 0;
	const flat = diff === 0;

	return (
		<div className="week">
			<div className="week__main">
				<p className="week__label">지난 7일</p>
				<p className="week__value">{hours(recent.seconds)}</p>
			</div>
			<p
				className={
					diff === null || flat
						? "week__diff"
						: up
							? "week__diff week__diff--up"
							: "week__diff week__diff--down"
				}
			>
				{diff === null
					? "첫 주"
					: flat
						? "그 전 주와 같음"
						: `${up ? "▲" : "▼"} ${Math.abs(diff)}%`}
				{previous.seconds > 0 && (
					<span className="week__prev">{`그 전 7일 ${hours(previous.seconds)}`}</span>
				)}
			</p>
		</div>
	);
}

/** 처음에 보여줄 인원. 76명을 다 펼치면 아래 구역들이 화면 밖으로 밀린다. */
const RANK_PREVIEW = 10;

export function Ranking({
	people,
	onOpen,
}: {
	people: PersonStat[];
	onOpen: (person: PersonStat) => void;
}) {
	const [expanded, setExpanded] = useState(false);

	if (people.length === 0) return <p className="empty">기록이 없습니다</p>;

	const shown = expanded ? people : people.slice(0, RANK_PREVIEW);
	const rest = people.length - shown.length;

	return (
		<>
		<ol className="rank">
			{shown.map((person, index) => {
				const average = person.days > 0 ? person.seconds / person.days : 0;
				const tier = studyTier(average);

				return (
					<li key={person.displayName}>
						<button
							type="button"
							className="rank__row"
							onClick={() => onOpen(person)}
						>
							<span className="rank__place">
								{MEDAL[index] ?? index + 1}
							</span>
							<StudyIcon
								tier={tier}
								face="🧑‍💻"
								label={`하루 평균 ${hours(average)}`}
								small
							/>
							<span className="rank__body">
								<span className="rank__name">{person.displayName}</span>
								<span className="rank__meta">
									{`${person.days}일 · 하루 ${hours(average)}`}
									{person.streakAlive === true && person.streak >= 2 && (
										<span className="rank__streak">
											{`🔥 ${person.streak}일 연속`}
										</span>
									)}
								</span>
							</span>
							<span className="rank__total">{hours(person.seconds)}</span>
						</button>
					</li>
				);
			})}
		</ol>
		{rest > 0 && (
			<button
				type="button"
				className="rank__more"
				onClick={() => setExpanded(true)}
			>
				{`${rest}명 더 보기`}
			</button>
		)}
		</>
	);
}

/**
 * 날짜 고르기.
 *
 * 화살표로 앞뒤 날을 오가고, 달력으로 아무 날이나 바로 짚는다.
 *
 * 화살표는 **기록이 있는 날로** 건너뛴다. 하루씩 옮기면 빈 날에서 멈춰
 * 몇 번을 더 눌러야 하는지 알 수 없다. 더 갈 곳이 없으면 눌리지 않는다.
 */
function DayPicker({
	days,
	value,
	onChange,
}: {
	days: StatsData["days"];
	value: string;
	onChange: (date: string) => void;
}) {
	const withRecords = days.filter((d) => d.seconds > 0).map((d) => d.date);
	const index = withRecords.indexOf(value);

	// 목록에 없는 날(달력으로 직접 짚은 빈 날)이면 앞뒤로 가장 가까운 날을 찾는다
	const prev =
		index > 0
			? withRecords[index - 1]
			: [...withRecords].reverse().find((d) => d < value);
	const next =
		index >= 0
			? withRecords[index + 1]
			: withRecords.find((d) => d > value);

	return (
		<div className="daynav">
			<button
				type="button"
				className="daynav__arrow"
				onClick={() => prev && onChange(prev)}
				disabled={!prev}
				aria-label="이전 날"
			>
				←
			</button>

			<div className="daynav__center">
				<input
					type="date"
					className="daynav__field"
					value={value}
					min={withRecords[0]}
					max={withRecords[withRecords.length - 1]}
					onChange={(event) => onChange(event.target.value)}
					aria-label="날짜"
				/>
				<span className="daynav__weekday">
					{value ? dayLabel(value).slice(-3) : ""}
				</span>
			</div>

			<button
				type="button"
				className="daynav__arrow"
				onClick={() => next && onChange(next)}
				disabled={!next}
				aria-label="다음 날"
			>
				→
			</button>
		</div>
	);
}

function Periods({ buckets }: { buckets: StatsData["weeks"] }) {
	const withRecords = buckets.filter((b) => b.seconds > 0);

	if (withRecords.length === 0) return <p className="empty">기록이 없습니다</p>;

	return (
		<>
			<Columns
				items={buckets.map((b) => ({
					key: b.key,
					label: periodLabel(b.key),
					value: b.seconds,
				}))}
				format={hours}
				labelEvery={buckets.length > 8 ? 2 : 1}
				peakLabel="가장 많았던"
			/>

			<ul className="facts">
				{[...withRecords].reverse().map((b) => (
					<li key={b.key} className="facts__row">
						<span className="facts__label">{periodLabel(b.key)}</span>
						<span className="facts__value">{hours(b.seconds)}</span>
						<span className="facts__note">
							{`${b.people}명 · 하루 ${hours(b.seconds / Math.max(b.activeDays, 1))}`}
						</span>
					</li>
				))}
			</ul>
		</>
	);
}

export function Summary({ data }: { data: StatsData }) {
	const busiest = [...data.hours].sort((a, b) => b.seconds - a.seconds)[0];

	return (
		<>
			<header className="header">
				<p className="header__label">{`${data.from} ~ ${data.to}`}</p>
				<p className="header__count">
					{hours(data.totalSeconds)}
					<span className="header__unit">누적</span>
				</p>
				<p className="header__meta">
					{`${data.totalPeople}명 참여`}
					{busiest && busiest.seconds > 0 && ` · 붐비는 시간 ${busiest.hour}시`}
				</p>
			</header>

			<WeekCard week={data.week} />

			{data.typicalStart && data.typicalEnd && (
				<p className="stats__typical">
					{`보통 ${data.typicalStart} 에 시작해서 ${
						// 끝이 시작보다 이르면 자정을 넘긴 것이다
						data.typicalEnd < data.typicalStart ? "다음날 " : ""
					}${data.typicalEnd} 에 끝납니다`}
				</p>
			)}
		</>
	);
}

function Body({
	data,
	view,
	onOpen,
}: {
	data: StatsData;
	view: View;
	onOpen: (person: PersonStat) => void;
}) {

	// 요일은 그 요일이 몇 번 있었는지가 다르다. 합계로 견주면 기간에 두 번 든
	// 요일이 유리해진다. 하루 평균으로 고쳐 놓고 본다.
	const weekdayAvg = data.weekdays.map((w) => ({
		...w,
		average: w.days > 0 ? w.seconds / w.days : 0,
	}));

	return (
		<>
			<Periods buckets={view === "weeks" ? data.weeks : data.months} />

			<h3 className="stats__title stats__title--gap">랭킹</h3>
			<Ranking people={data.people} onOpen={onOpen} />

			{/* 하루의 모양. 24칸이라 라벨은 세 시간마다 */}
			<h3 className="stats__title stats__title--gap">시간대</h3>
			<Columns
				items={data.hours.map((h) => ({
					key: String(h.hour),
					label: `${h.hour}`,
					value: h.seconds,
				}))}
				format={hours}
				labelEvery={3}
				peakLabel="가장 붐비는 시간"
			/>

			<h3 className="stats__title stats__title--gap">요일</h3>
			<Columns
				items={weekdayAvg.map((w) => ({
					key: String(w.weekday),
					label: WEEKDAY[w.weekday] ?? "",
					value: w.average,
				}))}
				format={hours}
				peakLabel="가장 많이 모이는 요일"
			/>
		</>
	);
}

export default function Stats() {
	const [mode, setMode] = useState<Mode>("day");
	const [view, setView] = useState<View>("weeks");
	const [date, setDate] = useState("");
	const [selected, setSelected] = useState<PersonStat | null>(null);

	// 스냅샷도 날짜 목록이 필요하다. 넉넉히 받아 두고 화면에서 가른다.
	const days = mode === "day" ? 90 : VIEW_DAYS[view];

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["stats", days],
		queryFn: () => fetchStats(days),
	});

	// 처음에는 기록이 있는 가장 최근 날을 연다. 오늘이 비어 있으면 어제다.
	const latest = data?.days.filter((d) => d.seconds > 0).at(-1)?.date ?? "";
	const shown = date || latest;

	return (
		<main className="screen">
			<div className="topbar">
				<a className="topbar__back" href="/">
					← 접속 현황
				</a>
				<div className="topbar__actions">
					<ThemeToggle />
				</div>
			</div>

			<nav className="tabs">
				{MODES.map((m) => (
					<button
						key={m.id}
						type="button"
						className={mode === m.id ? "tab tab--on" : "tab"}
						onClick={() => setMode(m.id)}
					>
						{m.label}
					</button>
				))}
			</nav>

			{isPending && <p className="empty">불러오는 중…</p>}
			{isError && (
				<p className="empty">
					{error instanceof Error ? error.message : "불러오지 못했습니다"}
				</p>
			)}

			{data && mode === "day" && (
				<>
					<DayPicker days={data.days} value={shown} onChange={setDate} />
					{shown && <DayView date={shown} />}
				</>
			)}

			{data && mode === "stats" && (
				<>
					{/* 통계의 최상위는 단위다. 단위가 보는 기간까지 정한다 */}
					<nav className="tabs stats__range">
						{VIEWS.map((v) => (
							<button
								key={v.id}
								type="button"
								className={view === v.id ? "tab tab--on" : "tab"}
								onClick={() => setView(v.id)}
							>
								{v.label}
							</button>
						))}
					</nav>

					<Summary data={data} />
					<Body data={data} view={view} onOpen={setSelected} />
				</>
			)}

			{selected && (
				<PersonDialog person={selected} onClose={() => setSelected(null)} />
			)}
		</main>
	);
}
