import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
	fetchPresence,
	type PresenceSnapshot,
	saveStatusMessage,
	type SessionParticipant,
} from "./api.ts";
import { formatAgo, formatElapsed, formatLeftAgo } from "./format.ts";
import StatusMessage from "./StatusMessage.tsx";
import ThemeToggle from "./ThemeToggle.tsx";
import Toast, { type ToastState, type ToastTone } from "./Toast.tsx";

const POLL_INTERVAL_MS = 5000;

function Row({
	participant,
	now,
	onSaveStatus,
}: {
	participant: SessionParticipant;
	now: number;
	onSaveStatus: (uuid: string, message: string) => Promise<void>;
}) {
	return (
		<li className={participant.isPresent ? "row" : "row row--offline"}>
			<div className="row__main">
				<span className="row__name">
					{participant.displayName ?? "이름 없음"}
				</span>
				<StatusMessage
					value={participant.statusMessage}
					dimmed={!participant.isPresent}
					onSave={(message) =>
						onSaveStatus(participant.participantUuid, message)
					}
				/>
			</div>
			<span className="row__time">
				{participant.isPresent
					? formatElapsed(participant.firstJoinedAt, now)
					: formatLeftAgo(participant.lastOccurredAt, now)}
			</span>
		</li>
	);
}

function Section({
	title,
	tone,
	people,
	now,
	emptyText,
	onSaveStatus,
}: {
	title: string;
	tone: "online" | "offline";
	people: SessionParticipant[];
	now: number;
	emptyText?: string;
	onSaveStatus: (uuid: string, message: string) => Promise<void>;
}) {
	if (people.length === 0 && !emptyText) {
		return null;
	}

	return (
		<section className={`section section--${tone}`}>
			<h2 className="section__title">
				<span className={`section__dot section__dot--${tone}`} aria-hidden="true" />
				{title}
				<span className="section__count">{`${people.length}명`}</span>
			</h2>

			{people.length === 0 ? (
				<p className="section__empty">{emptyText}</p>
			) : (
				<ul className="list">
					{people.map((p) => (
						<Row
							key={p.participantUuid}
							participant={p}
							now={now}
							onSaveStatus={onSaveStatus}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

export default function App() {
	// 경과 시간 표시를 1초마다 다시 그린다 (데이터 요청과 무관)
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const queryClient = useQueryClient();
	const [toast, setToast] = useState<ToastState | null>(null);

	const showToast = useCallback((tone: ToastTone, message: string) => {
		setToast({ key: Date.now(), tone, message });
	}, []);

	const dismissToast = useCallback(() => setToast(null), []);

	const { data, isPending, isError, isFetching } = useQuery({
		queryKey: ["presence"],
		queryFn: fetchPresence,
		refetchInterval: POLL_INTERVAL_MS,
		// 통신이 끊겨도 직전 목록을 유지한다.
		// 화면이 비면 전원 퇴장으로 오해된다.
		placeholderData: (previous) => previous,
	});

	const statusMutation = useMutation({
		mutationFn: ({ uuid, message }: { uuid: string; message: string }) =>
			saveStatusMessage(uuid, message),
		onError: (error) => {
			showToast(
				"error",
				error instanceof Error ? error.message : "상태 메시지를 저장하지 못했습니다",
			);
		},
		onSuccess: (saved, { uuid }) => {
			showToast("success", saved ? "상태 메시지를 저장했습니다" : "상태 메시지를 지웠습니다");
			// 다음 폴링을 기다리지 않고 바로 반영한다
			queryClient.setQueryData<PresenceSnapshot>(["presence"], (prev) =>
				prev
					? {
							...prev,
							participants: prev.participants.map((p) =>
								p.participantUuid === uuid ? { ...p, statusMessage: saved } : p,
							),
						}
					: prev,
			);
		},
	});

	async function handleSaveStatus(uuid: string, message: string) {
		await statusMutation.mutateAsync({ uuid, message });
	}

	const updatedAt = data?.updatedAt ? Date.parse(data.updatedAt) : null;
	const online = data?.participants.filter((p) => p.isPresent) ?? [];
	const offline = data?.participants.filter((p) => !p.isPresent) ?? [];
	const loading = isPending && !data;

	return (
		<main className="screen">
			<Toast toast={toast} onDismiss={dismissToast} />

			{isError && data && (
				<div className="banner" role="status">
					연결 끊김 · 마지막 정보를 보여주는 중
				</div>
			)}

			<div className="topbar">
				<p className="topbar__total">
					{loading || (data?.totalCount ?? 0) === 0
						? " "
						: `이 회의에 지금까지 ${data?.totalCount}명이 참여했습니다`}
				</p>
				<ThemeToggle />
			</div>

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
			) : (
				<>
					<Section
						title="온라인"
						tone="online"
						people={online}
						now={now}
						emptyText="접속 중인 사람이 없습니다"
						onSaveStatus={handleSaveStatus}
					/>
					<Section
						title="오프라인"
						tone="offline"
						people={offline}
						now={now}
						onSaveStatus={handleSaveStatus}
					/>
				</>
			)}
		</main>
	);
}
