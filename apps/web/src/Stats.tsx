import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchStats, type PersonStat, type Stats as StatsData } from "./api.ts";
import { studyTier } from "./format.ts";
import PersonDialog from "./PersonDialog.tsx";
import StudyIcon from "./StudyIcon.tsx";
import ThemeToggle from "./ThemeToggle.tsx";

const RANGES = [7, 14, 30] as const;
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="stats__section">
			<h2 className="stats__title">{title}</h2>
			{children}
		</section>
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

function Ranking({
	people,
	onOpen,
}: {
	people: PersonStat[];
	onOpen: (person: PersonStat) => void;
}) {
	if (people.length === 0) return <p className="empty">기록이 없습니다</p>;

	return (
		<ol className="rank">
			{people.map((person, index) => {
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
	);
}

function Body({
	data,
	onOpen,
}: {
	data: StatsData;
	onOpen: (person: PersonStat) => void;
}) {
	const dayMax = Math.max(...data.days.map((d) => d.seconds), 1);
	const hourMax = Math.max(...data.hours.map((h) => h.seconds), 1);

	// 요일은 그 요일이 몇 번 있었는지가 다르다. 합계로 견주면 기간에 두 번 든
	// 요일이 유리해진다. 하루 평균으로 고쳐 놓고 본다.
	const weekdayAvg = data.weekdays.map((w) => ({
		...w,
		average: w.days > 0 ? w.seconds / w.days : 0,
	}));
	const weekdayMax = Math.max(...weekdayAvg.map((w) => w.average), 1);

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
					{`보통 ${data.typicalStart} 에 시작해서 ${data.typicalEnd} 에 끝납니다`}
				</p>
			)}

			<Section title="랭킹">
				<Ranking people={data.people} onOpen={onOpen} />
			</Section>

			<Section title="날짜별">
				<ul className="chart">
					{[...data.days].reverse().map((d) => (
						<Bar
							key={d.date}
							label={dayLabel(d.date)}
							value={d.seconds}
							max={dayMax}
							note={
								d.people > 0
									? `${d.people}명 · 동시 최대 ${d.peak}명${
											d.firstAt && d.lastAt ? ` · ${d.firstAt}~${d.lastAt}` : ""
										}`
									: undefined
							}
							dim={d.seconds === 0}
						/>
					))}
				</ul>
			</Section>

			<Section title="시간대별">
				<ul className="chart">
					{data.hours.map((h) => (
						<Bar
							key={h.hour}
							label={`${h.hour}시`}
							value={h.seconds}
							max={hourMax}
							dim={h.seconds === 0}
						/>
					))}
				</ul>
			</Section>

			<Section title="요일별">
				<ul className="chart">
					{weekdayAvg.map((w) => (
						<Bar
							key={w.weekday}
							label={WEEKDAY[w.weekday] ?? ""}
							value={w.average}
							max={weekdayMax}
							suffix={w.days > 0 ? `${w.days}일` : undefined}
							dim={w.average === 0}
						/>
					))}
				</ul>
			</Section>
		</>
	);
}

export default function Stats() {
	const [days, setDays] = useState(14);
	const [selected, setSelected] = useState<PersonStat | null>(null);

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["stats", days],
		queryFn: () => fetchStats(days),
	});

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
				{RANGES.map((r) => (
					<button
						key={r}
						type="button"
						className={days === r ? "tab tab--on" : "tab"}
						onClick={() => setDays(r)}
					>
						{`${r}일`}
					</button>
				))}
			</nav>

			{isPending && <p className="empty">불러오는 중…</p>}
			{isError && (
				<p className="empty">
					{error instanceof Error ? error.message : "불러오지 못했습니다"}
				</p>
			)}
			{data && <Body data={data} onOpen={setSelected} />}

			{selected && (
				<PersonDialog person={selected} onClose={() => setSelected(null)} />
			)}
		</main>
	);
}
