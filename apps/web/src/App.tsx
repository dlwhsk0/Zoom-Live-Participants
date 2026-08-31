import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
	fetchPresence,
	saveStatusMessage,
	type PresenceSnapshot,
	type SessionParticipant,
} from "./api.ts";
import {
	formatAgo,
	formatDuration,
	formatLeftAgo,
	formatSessionStart,
	restTier,
	studyTier,
	totalOnlineSeconds,
} from "./format.ts";
import StatusMessage from "./StatusMessage.tsx";
import ThemeToggle from "./ThemeToggle.tsx";
import Toast, { type ToastState, type ToastTone } from "./Toast.tsx";

const POLL_INTERVAL_MS = 5000;

/** 접속 중일 때 누적 시간에 따라 붙는 불꽃. 2단계부터 붙는다. */
const FLAME_LABEL = [
	"",
	"",
	"불이 붙음",
	"활활 타는 중",
	"파랗게 타는 중",
];

/** 나간 지 오래될수록 깊이 잠든다. 경계는 접속 쪽과 같은 1·3·5시간. */
const REST_ICON = ["☕", "🥱", "😴", "💤"];
const REST_LABEL = ["잠깐 자리 비움", "졸기 시작", "자는 중", "오늘은 끝"];

function Card({
	participant,
	now,
	onSaveStatus,
}: {
	participant: SessionParticipant;
	now: number;
	onSaveStatus: (uuid: string, message: string) => Promise<void>;
}) {
	const seconds = totalOnlineSeconds(participant, now);
	const tier = participant.isPresent ? studyTier(seconds) : 0;
	const rest = participant.isPresent ? 0 : restTier(participant.lastOccurredAt, now);

	// 입장을 놓친 사람은 실제로는 더 오래 있었을 수 있다. 아래로만 틀린다.
	const atLeast = participant.joinTimeUncertain && participant.isPresent;

	return (
		<li
			className={
				participant.isPresent
					? `card card--tier${tier}`
					: "card card--offline"
			}
		>
			<span
				className={`card__icon card__icon--tier${participant.isPresent ? tier : 0}`}
				role="img"
				aria-label={
					participant.isPresent
						? `공부 중${tier >= 2 ? `, ${FLAME_LABEL[tier]}` : ""}`
						: REST_LABEL[rest]
				}
			>
				{/* 3단계부터는 불이 사람 뒤로 가고 커진다 */}
				{participant.isPresent && tier >= 3 && (
					<span className="card__blaze" aria-hidden="true">
						🔥
					</span>
				)}
				<span className="card__person">
					{participant.isPresent ? "🧑‍💻" : REST_ICON[rest]}
				</span>
				{participant.isPresent && tier === 2 && (
					<span className="card__flame" aria-hidden="true">
						🔥
					</span>
				)}
			</span>

			<span className="card__name">
				{participant.displayName ?? "이름 없음"}
				{participant.isYou && <span className="card__me">나</span>}
			</span>

			<span
				className="card__time"
				title={
					atLeast
						? "서버가 입장 이벤트를 받지 못했습니다. 실제로는 이보다 깁니다"
						: undefined
				}
			>
				{participant.isPresent
					? `${formatDuration(seconds)}${atLeast ? "+" : ""}`
					: formatLeftAgo(participant.lastOccurredAt, now)}
			</span>

			<StatusMessage
				value={participant.statusMessage}
				dimmed={!participant.isPresent}
				isYou={participant.isYou}
				onSave={(message) => onSaveStatus(participant.participantUuid, message)}
			/>
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
				<ul className="grid">
					{people.map((p) => (
						<Card
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
	// 접속 중은 누적 시간이 많은 순. 서버가 정렬해 줄 수 없는 이유는,
	// 진행 중인 구간이 서버 값에 빠져 있어 매 초 값이 달라지기 때문이다.
	// (한 번도 안 나간 사람은 서버 기준으로 0초다.)
	const online = (data?.participants.filter((p) => p.isPresent) ?? [])
		.slice()
		.sort((a, b) => totalOnlineSeconds(b, now) - totalOnlineSeconds(a, now));
	// 나간 사람은 서버가 준 순서를 그대로 쓴다. 최근에 나간 사람이 앞이다.
	const offline = data?.participants.filter((p) => !p.isPresent) ?? [];
	const loading = isPending && !data;

	// 값이 없으면 빈 문자열이 와서 아래 렌더가 통째로 빠진다.
	const sessionStart = formatSessionStart(data?.startedAt ?? null);

	return (
		<main className="screen">
			<Toast toast={toast} onDismiss={dismissToast} />

			{isError && data && (
				<div className="banner" role="status">
					연결 끊김 · 마지막 정보를 보여주는 중
				</div>
			)}

			<div className="topbar">
				<div className="topbar__meta">
					<p className="topbar__total">
						{loading || (data?.totalCount ?? 0) === 0
							? " "
							: `이 회의에 지금까지 ${data?.totalCount}명이 참여했습니다`}
					</p>
					{sessionStart && (
						<p className="topbar__started">
							{sessionStart}
							{/* 추정값이면 시작 시각이라고 단정하지 않는다.
							    서버가 늦게 켜졌다면 실제 시작은 이보다 이르다. */}
							{data?.startedAtEstimated ? "부터 기록" : " 시작"}
						</p>
					)}
				</div>
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
