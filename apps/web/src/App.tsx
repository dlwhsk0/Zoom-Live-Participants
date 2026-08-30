import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchPresence, type SessionParticipant } from "./api.ts";
import { formatAgo, formatElapsed, formatLeftAgo } from "./format.ts";

const POLL_INTERVAL_MS = 5000;

function Row({
	participant,
	now,
}: {
	participant: SessionParticipant;
	now: number;
}) {
	return (
		<li className={participant.isPresent ? "row" : "row row--offline"}>
			<span className="row__name">
				{participant.displayName ?? "이름 없음"}
			</span>
			<span className="row__time">
				{participant.isPresent
					? formatElapsed(participant.firstJoinedAt, now)
					: formatLeftAgo(participant.lastOccurredAt, now)}
			</span>
		</li>
	);
}

export default function App() {
	// 경과 시간 표시를 1초마다 다시 그린다 (데이터 요청과 무관)
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const { data, isPending, isError, isFetching } = useQuery({
		queryKey: ["presence"],
		queryFn: fetchPresence,
		refetchInterval: POLL_INTERVAL_MS,
		// 통신이 끊겨도 직전 목록을 유지한다.
		// 화면이 비면 전원 퇴장으로 오해된다.
		placeholderData: (previous) => previous,
	});

	const updatedAt = data?.updatedAt ? Date.parse(data.updatedAt) : null;
	const online = data?.participants.filter((p) => p.isPresent) ?? [];
	const offline = data?.participants.filter((p) => !p.isPresent) ?? [];
	const loading = isPending && !data;

	return (
		<main className="screen">
			{isError && data && (
				<div className="banner" role="status">
					연결 끊김 · 마지막 정보를 보여주는 중
				</div>
			)}

			<header className="header">
				<p className="header__label">접속 중</p>
				<p className="header__count">
					{loading ? (
						<span className="header__placeholder">—</span>
					) : (
						<>
							{data?.count ?? 0}
							<span className="header__unit">명</span>
						</>
					)}
				</p>
				<p className="header__meta">
					{isError && !data ? "불러오지 못했습니다" : formatAgo(updatedAt, now)}
					{isFetching && <span className="header__dot" aria-hidden="true" />}
				</p>
			</header>

			{loading ? (
				<p className="empty">불러오는 중…</p>
			) : online.length === 0 ? (
				<p className="empty">접속 중인 사람이 없습니다</p>
			) : (
				<ul className="list">
					{online.map((p) => (
						<Row key={p.participantUuid} participant={p} now={now} />
					))}
				</ul>
			)}

			{offline.length > 0 && (
				<section className="section">
					<h2 className="section__title">
						나간 사람{" "}
						<span className="section__count">{`${offline.length}명`}</span>
					</h2>
					<ul className="list">
						{offline.map((p) => (
							<Row key={p.participantUuid} participant={p} now={now} />
						))}
					</ul>
				</section>
			)}

			{!loading && (data?.totalCount ?? 0) > 0 && (
				<p className="footnote">
					{`이 회의에 지금까지 ${data?.totalCount}명이 참여했습니다`}
				</p>
			)}
		</main>
	);
}
