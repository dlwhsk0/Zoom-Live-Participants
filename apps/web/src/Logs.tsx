import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchLogs, type LogEntry } from "./api.ts";
import ThemeToggle from "./ThemeToggle.tsx";

/**
 * 접근 키는 주소에서 읽는다. 로그에는 이름과 IP 가 들어 있다.
 *
 * 서버 렌더에서는 window 가 없다. 테스트와 미리보기가 renderToString 을 쓰므로 방어한다.
 */
function readKey(): string {
	if (typeof window === "undefined") return "";
	return new URLSearchParams(window.location.search).get("key") ?? "";
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
				{entry.isRoomMove && <span className="log__tag">방 이동</span>}
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

export default function Logs() {
	const [key] = useState(readKey);
	const [showRaw, setShowRaw] = useState(false);

	const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: ["logs", key, showRaw],
			enabled: key.length > 0,
			initialPageParam: null as string | null,
			queryFn: ({ pageParam }) =>
				fetchLogs({ key, cursor: pageParam, raw: showRaw }),
			getNextPageParam: (last) => last.nextCursor,
			retry: false,
		});

	const entries = data?.pages.flatMap((p) => p.entries) ?? [];

	if (!key) {
		return (
			<main className="screen">
				<p className="empty">
					접근 키가 필요합니다. 주소 끝에 <code>?key=...</code> 를 붙여주세요.
				</p>
			</main>
		);
	}

	return (
		<main className="screen">
			<div className="topbar">
				<p className="topbar__total">
					{isPending ? " " : `입퇴장 기록 ${entries.length}건`}
				</p>
				<div className="topbar__actions">
					<button
						type="button"
						className={showRaw ? "chip chip--on" : "chip"}
						onClick={() => setShowRaw((v) => !v)}
					>
						원본
					</button>
					<ThemeToggle />
				</div>
			</div>

			<header className="header">
				<p className="header__label">로그</p>
				<p className="header__meta">
					{showRaw ? "항목을 누르면 원본 payload 가 펼쳐집니다" : "입퇴장 이력"}
				</p>
			</header>

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
		</main>
	);
}
