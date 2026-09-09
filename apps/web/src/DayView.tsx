import { useQuery } from "@tanstack/react-query";

import { fetchDay } from "./api.ts";
import { formatDuration, studyTier } from "./format.ts";
import StudyIcon from "./StudyIcon.tsx";

/**
 * 하루치 참가자 목록.
 *
 * 통계가 아니라 **그날의 화면**이다. 접속 현황과 같은 타일로 그린다 —
 * "9월 6일에 누가 있었나" 를 보는 눈이 지금 화면을 보는 눈과 같아야 한다.
 */
export default function DayView({ date }: { date: string }) {
	const { data, isPending, isError, error } = useQuery({
		queryKey: ["day", date],
		queryFn: () => fetchDay(date),
	});

	if (isPending) return <p className="empty">불러오는 중…</p>;

	if (isError) {
		return (
			<p className="empty">
				{error instanceof Error ? error.message : "불러오지 못했습니다"}
			</p>
		);
	}

	if (data.people.length === 0) {
		return <p className="empty">그날은 아무도 없었습니다</p>;
	}

	return (
		<>
			<p className="day__meta">
				{`${data.people.length}명 · 동시 최대 ${data.peak}명`}
				{data.firstAt && data.lastAt && ` · ${data.firstAt}~${data.lastAt}`}
			</p>

			<ul className="grid">
				{data.people.map((person) => {
					const tier = studyTier(person.seconds);

					return (
						<li key={person.displayName}>
							{/* 접속 현황의 타일과 같은 구조다. 누를 것은 없다 */}
							<div className="card card--static">
								<StudyIcon
									tier={tier}
									face="🧑‍💻"
									label={`${formatDuration(person.seconds)} 공부`}
								/>
								<span className="card__name">{person.displayName}</span>
								<span className="card__time">
									{formatDuration(person.seconds)}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
		</>
	);
}
