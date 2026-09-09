import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchStats, type Stats as StatsData } from "./api.ts";
import ThemeToggle from "./ThemeToggle.tsx";

const RANGES = [7, 14, 30] as const;
const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

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
	return `${date.slice(5)} (${WEEKDAY_LABEL[d.getUTCDay()] ?? ""})`;
}

/**
 * 가로 막대 한 줄.
 *
 * 차트 라이브러리를 넣지 않는다. 막대 몇 개 그리자고 200KB 를 더할 이유가
 * 없고, 이 저장소는 의존성을 얇게 유지해 왔다.
 */
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
	/** 값 옆에 붙는 짧은 곁가지. 한 줄을 더 쓸 만큼은 아닌 것. */
	suffix?: string;
	/** 줄 아래에 붙는 곁가지. 길어서 값 옆에 못 붙이는 것. */
	note?: string;
	dim?: boolean;
}) {
	const percent = max > 0 ? (value / max) * 100 : 0;

	return (
		<li className={dim ? "chart__row chart__row--dim" : "chart__row"}>
			<span className="chart__label">{label}</span>
			<span className="chart__track">
				<span className="chart__fill" style={{ width: `${percent}%` }} />
			</span>
			<span className="chart__value">
				{hours(value)}
				{suffix && <span className="chart__suffix">{suffix}</span>}
			</span>
			{note && <span className="chart__note">{note}</span>}
		</li>
	);
}

function Section({
	title,
	hint,
	children,
}: {
	title: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="stats__section">
			<h2 className="stats__title">{title}</h2>
			{hint && <p className="stats__hint">{hint}</p>}
			{children}
		</section>
	);
}

function Body({ data }: { data: StatsData }) {
	const dayMax = Math.max(...data.days.map((d) => d.seconds), 1);
	const hourMax = Math.max(...data.hours.map((h) => h.seconds), 1);
	const personMax = Math.max(...data.people.map((p) => p.seconds), 1);

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
					{busiest && busiest.seconds > 0 && ` · 가장 붐빈 시간 ${busiest.hour}시`}
				</p>
			</header>

			<Section title="날짜별" hint="막대는 그날 머문 시간의 합">
				<ul className="chart">
					{[...data.days].reverse().map((d) => (
						<Bar
							key={d.date}
							label={dayLabel(d.date)}
							value={d.seconds}
							max={dayMax}
							note={d.people > 0 ? `${d.people}명 · 동시 최대 ${d.peak}명` : undefined}
							dim={d.seconds === 0}
						/>
					))}
				</ul>
			</Section>

			<Section title="시간대별" hint="지나간 시간을 시각별로 나눠 담았다">
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

			<Section title="요일별" hint="그 요일 하루 평균">
				<ul className="chart">
					{weekdayAvg.map((w) => (
						<Bar
							key={w.weekday}
							label={WEEKDAY_LABEL[w.weekday] ?? ""}
							value={w.average}
							max={weekdayMax}
							suffix={w.days > 0 ? `${w.days}일` : undefined}
							dim={w.average === 0}
						/>
					))}
				</ul>
			</Section>

			<Section title="사람별" hint="같이 접속한 시간은 한 번만 센다">
				{data.people.length === 0 ? (
					<p className="empty">기록이 없습니다</p>
				) : (
					<ul className="chart">
						{data.people.map((p) => (
							<Bar
								key={p.displayName}
								label={p.displayName}
								value={p.seconds}
								max={personMax}
								suffix={`${p.days}일`}
							/>
						))}
					</ul>
				)}
			</Section>
		</>
	);
}

export default function Stats() {
	const [days, setDays] = useState(14);

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
			{data && <Body data={data} />}
		</main>
	);
}
