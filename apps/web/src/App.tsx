import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchPresence } from "./api.ts";
import { formatAgo, formatElapsed } from "./format.ts";

const POLL_INTERVAL_MS = 5000;

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
	const participants = data?.participants ?? [];

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
					{isPending && !data ? (
						<span className="header__placeholder">—</span>
					) : (
						<>
							{data?.count ?? 0}
							<span className="header__unit">명</span>
						</>
					)}
				</p>
				<p className="header__meta">
					{isError && !data
						? "불러오지 못했습니다"
						: formatAgo(updatedAt, now)}
					{isFetching && <span className="header__dot" aria-hidden="true" />}
				</p>
			</header>

			{isPending && !data ? (
				<p className="empty">불러오는 중…</p>
			) : participants.length === 0 ? (
				<p className="empty">접속 중인 사람이 없습니다</p>
			) : (
				<ul className="list">
					{participants.map((participant) => (
						<li className="row" key={participant.participantUuid}>
							<span className="row__name">
								{participant.displayName ?? "이름 없음"}
							</span>
							<span className="row__time">
								{formatElapsed(participant.firstJoinedAt, now)}
							</span>
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
