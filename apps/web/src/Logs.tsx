import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import AdminActions from "./AdminActions.tsx";
import Aliases from "./Aliases.tsx";
import { fetchLogs, fetchMe, logout, type LogEntry } from "./api.ts";
import LoginForm from "./LoginForm.tsx";
import People from "./People.tsx";
import ThemeToggle from "./ThemeToggle.tsx";
import Toast, { type ToastState } from "./Toast.tsx";

type Tab = "people" | "aliases" | "logs" | "history";

const TABS: { id: Tab; label: string }[] = [
	{ id: "people", label: "사람" },
	{ id: "aliases", label: "별칭" },
	{ id: "logs", label: "로그" },
	{ id: "history", label: "기록" },
];

/** 열린 탭을 주소에 남긴다. 새로고침해도 보던 탭이 유지되고 링크로 공유된다. */
function readTab(): Tab {
	if (typeof window === "undefined") return "people";

	const value = new URLSearchParams(window.location.search).get("tab");
	return TABS.some((t) => t.id === value) ? (value as Tab) : "people";
}

function selectTab(next: Tab, apply: (tab: Tab) => void): void {
	apply(next);

	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	url.searchParams.set("tab", next);
	window.history.replaceState(null, "", url);
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("ko-KR", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

/** leave_reason 은 "Reason :" 앞에 접두사가 붙어 온다. 뒤쪽만 보여준다. */
function shortReason(reason: string | null): string {
	if (!reason) return "";
	return reason.replace(/^.*Reason\s*:\s*/, "");
}

function Row({ entry, showRaw }: { entry: LogEntry; showRaw: boolean }) {
	const [open, setOpen] = useState(false);
	const joined = entry.eventType === "joined";

	return (
		<li className="log">
			<button
				type="button"
				className="log__head"
				onClick={() => showRaw && setOpen((v) => !v)}
				disabled={!showRaw}
			>
				<span className="log__time">{formatTime(entry.occurredAt)}</span>
				<span className={joined ? "log__type log__type--in" : "log__type"}>
					{joined ? "입장" : "퇴장"}
				</span>
				<span className="log__name">{entry.displayName ?? "이름 없음"}</span>
				<span className="log__tags">
					{entry.isRoomMove && <span className="log__tag">방 이동</span>}
					{entry.isConcurrent && (
						<span
							className="log__tag log__tag--concurrent"
							title="이 시각에 같은 사람의 다른 접속이 살아 있었습니다 (노트북 + 폰 등)"
						>
							{joined ? "동시 접속" : "다른 기기 접속 중"}
						</span>
					)}
				</span>
			</button>

			<div className="log__meta">
				{entry.leaveReason && (
					<span className="log__reason">{shortReason(entry.leaveReason)}</span>
				)}
				<span className="log__mono">uid={entry.userId ?? "-"}</span>
				<span className="log__mono">{entry.publicIp ?? "-"}</span>
			</div>

			{showRaw && open && (
				<pre className="log__raw">
					{JSON.stringify(entry.payload ?? {}, null, 2)}
				</pre>
			)}
		</li>
	);
}

function LogList() {
	const [showRaw, setShowRaw] = useState(false);

	const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: ["logs", showRaw],
			initialPageParam: null as string | null,
			queryFn: ({ pageParam }) =>
				fetchLogs({ cursor: pageParam, raw: showRaw }),
			getNextPageParam: (last) => last.nextCursor,
			retry: false,
		});

	const entries = data?.pages.flatMap((p) => p.entries) ?? [];

	return (
		<>
			<div className="admin__toolbar">
				<span className="admin__hint">
					{isPending ? " " : `입퇴장 기록 ${entries.length}건`}
					{showRaw ? " · 항목을 누르면 원본이 펼쳐집니다" : ""}
				</span>
				<button
					type="button"
					className={showRaw ? "chip chip--on" : "chip"}
					onClick={() => setShowRaw((v) => !v)}
				>
					원본
				</button>
			</div>

			{isError ? (
				<p className="empty">
					{error instanceof Error ? error.message : "불러오지 못했습니다"}
				</p>
			) : isPending ? (
				<p className="empty">불러오는 중…</p>
			) : entries.length === 0 ? (
				<p className="empty">기록이 없습니다</p>
			) : (
				<>
					<ul className="list">
						{entries.map((e) => (
							<Row key={e.id} entry={e} showRaw={showRaw} />
						))}
					</ul>
					{hasNextPage && (
						<button
							type="button"
							className="more"
							onClick={() => fetchNextPage()}
							disabled={isFetchingNextPage}
						>
							{isFetchingNextPage ? "불러오는 중…" : "더 보기"}
						</button>
					)}
				</>
			)}
		</>
	);
}

/**
 * 어드민 화면.
 *
 * 로그만 보던 페이지에 사람 합치기와 편집 기록을 더했다.
 * 참가자 이름과 IP 를 그대로 다루므로 로그인 없이는 아무것도 보이지 않는다.
 */
export default function Admin() {
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<Tab>(readTab);
	const [toast, setToast] = useState<ToastState | null>(null);

	// 인라인 화살표로 넘기면 매 렌더 새 함수가 되어 Toast 의 자동 닫힘
	// 타이머가 계속 초기화된다. 고정해서 넘긴다.
	const dismissToast = useCallback(() => setToast(null), []);

	const onToast = useCallback((message: string, ok: boolean) => {
		// key 를 매번 새로 줘야 같은 문구가 연달아 떠도 다시 보인다
		setToast({ key: Date.now(), message, tone: ok ? "success" : "error" });
	}, []);

	// 로그인 여부만 묻는다. 실패는 "안 되어 있음" 이지 오류가 아니다.
	const me = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });

	const signOut = useMutation({
		mutationFn: logout,
		onSettled: () => {
			// 로그아웃 뒤에 남은 어드민 데이터를 화면에 두지 않는다
			queryClient.clear();
		},
	});

	if (me.isPending) {
		return (
			<main className="screen">
				<p className="empty">확인하는 중…</p>
			</main>
		);
	}

	if (!me.data) {
		return <LoginForm />;
	}

	return (
		<main className="screen">
			<Toast toast={toast} onDismiss={dismissToast} />

			<div className="topbar">
				<p className="topbar__total">Admin</p>
				<div className="topbar__actions">
					<span className="topbar__who">{me.data.username}</span>
					<button
						type="button"
						className="topbar__signout"
						onClick={() => signOut.mutate()}
					>
						로그아웃
					</button>
					<ThemeToggle />
				</div>
			</div>

			<nav className="tabs">
				{TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						className={tab === t.id ? "tab tab--on" : "tab"}
						onClick={() => selectTab(t.id, setTab)}
					>
						{t.label}
					</button>
				))}
			</nav>

			{tab === "people" && <People onToast={onToast} />}
			{tab === "aliases" && <Aliases onToast={onToast} />}
			{tab === "logs" && <LogList />}
			{tab === "history" && <AdminActions onToast={onToast} />}
		</main>
	);
}
