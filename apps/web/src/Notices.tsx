import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
	createNotice,
	deleteNotice,
	fetchAdminNotices,
	patchNotice,
	type AdminNotice,
	type NoticeCategory,
	type NoticeInput,
} from "./api.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";

/**
 * 공지 관리.
 *
 * 화면 위쪽 말풍선에 도는 문구다. 운영 중에 바뀌므로 배포 없이 고칠 수 있어야
 * 한다.
 *
 * 지우는 것보다 **내리는 것**(보임 끄기)이 기본이다. 되살릴 일이 잦고, 지워
 * 버리면 무엇을 왜 내렸는지가 남지 않는다. 지우기는 잘못 만든 줄을 치울 때만
 * 쓰라고 확인 창 뒤에 둔다.
 */
/**
 * `datetime-local` 입력값 ↔ ISO.
 *
 * 입력은 브라우저 시간대의 벽시계 값이고 서버는 UTC 로 받는다. 그 사이를
 * Date 가 알아서 옮겨 준다 — 문자열을 직접 자르면 시간대가 어긋난다.
 */
function toLocalInput(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";

	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
	if (!value.trim()) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 기간을 사람이 읽는 한 줄로. 제한이 없으면 아무것도 안 쓴다. */
function describeWindow(notice: AdminNotice): string {
	const fmt = (iso: string) =>
		new Date(iso).toLocaleString("ko-KR", {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});

	if (notice.startsAt && notice.endsAt) return `${fmt(notice.startsAt)} ~ ${fmt(notice.endsAt)}`;
	if (notice.startsAt) return `${fmt(notice.startsAt)} 부터`;
	if (notice.endsAt) return `${fmt(notice.endsAt)} 까지`;
	return "";
}

/** 지금 이 공지가 실제로 화면에 뜨는가. 기간까지 따진 결과다. */
function isLive(notice: AdminNotice, now: number): boolean {
	if (!notice.isActive) return false;
	if (notice.startsAt && new Date(notice.startsAt).getTime() > now) return false;
	if (notice.endsAt && new Date(notice.endsAt).getTime() <= now) return false;
	return true;
}

export default function Notices({
	onToast,
}: {
	onToast: (message: string, ok: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState("");
	const [draftCategory, setDraftCategory] = useState<NoticeCategory>("general");
	const [draftStart, setDraftStart] = useState("");
	const [draftEnd, setDraftEnd] = useState("");
	const [editing, setEditing] = useState<string | null>(null);
	const [edit, setEdit] = useState<NoticeInput>({});
	const [removing, setRemoving] = useState<AdminNotice | null>(null);
	const now = Date.now();

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["adminNotices"],
		queryFn: fetchAdminNotices,
		retry: false,
	});

	function refresh() {
		void queryClient.invalidateQueries({ queryKey: ["adminNotices"] });
		// 참가자 화면이 쓰는 목록도 같이 갱신한다
		void queryClient.invalidateQueries({ queryKey: ["notices"] });
	}

	const add = useMutation({
		mutationFn: () =>
			createNotice({
				body: draft.trim(),
				category: draftCategory,
				startsAt: fromLocalInput(draftStart),
				endsAt: fromLocalInput(draftEnd),
			}),
		onSuccess: () => {
			onToast("공지를 추가했습니다", true);
			setDraft("");
			setDraftStart("");
			setDraftEnd("");
			setDraftCategory("general");
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	const patch = useMutation({
		mutationFn: (input: { id: string; patch: NoticeInput }) =>
			patchNotice(input.id, input.patch),
		onSuccess: () => {
			setEditing(null);
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	const remove = useMutation({
		mutationFn: (id: string) => deleteNotice(id),
		onSuccess: () => {
			onToast("공지를 지웠습니다", true);
			setRemoving(null);
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	const notices = data ?? [];
	const shown = notices.filter((n) => isLive(n, now)).length;

	/** 위아래로 한 칸 옮긴다. 정렬값을 서로 바꾸는 것으로 충분하다. */
	function move(index: number, direction: -1 | 1) {
		const target = notices[index + direction];
		const current = notices[index];
		if (!target || !current) return;

		patch.mutate({ id: current.id, patch: { sortOrder: target.sortOrder } });
		patch.mutate({ id: target.id, patch: { sortOrder: current.sortOrder } });
	}

	return (
		<>
			<p className="admin__hint">
				화면 위쪽 말풍선에 한 줄씩 돌아가며 뜹니다. 지금 {shown}개가 보이는
				중입니다. <strong>사용</strong>을 끄면 화면에서만 빠지고 기록은 남습니다.
				줄바꿈은 그대로 나갑니다 (⌘/Ctrl+Enter 로 추가).
			</p>

			<div className="notice__form">
				<div className="notice__new">
					<textarea
						className="notice__input"
						value={draft}
						rows={2}
						maxLength={200}
						placeholder="새 공지 (200자까지, 줄바꿈 가능)"
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							// Enter 는 줄바꿈이다. 보내는 것은 ⌘/Ctrl+Enter.
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
								add.mutate();
							}
						}}
					/>
					<button
						type="button"
						className="chip chip--on"
						disabled={!draft.trim() || add.isPending}
						onClick={() => add.mutate()}
					>
						추가
					</button>
				</div>
				<div className="notice__meta">
					<label className="notice__field">
						분류
						<select
							className="notice__select"
							value={draftCategory}
							onChange={(e) => setDraftCategory(e.target.value as NoticeCategory)}
						>
							<option value="general">일반</option>
							<option value="main">메인</option>
						</select>
					</label>
					<label className="notice__field">
						시작
						<input
							type="datetime-local"
							className="notice__select"
							value={draftStart}
							onChange={(e) => setDraftStart(e.target.value)}
						/>
					</label>
					<label className="notice__field">
						마감
						<input
							type="datetime-local"
							className="notice__select"
							value={draftEnd}
							onChange={(e) => setDraftEnd(e.target.value)}
						/>
					</label>
					<span className="notice__hint">비우면 제한 없음</span>
				</div>
			</div>

			{isError ? (
				<p className="empty">
					{error instanceof Error ? error.message : "불러오지 못했습니다"}
				</p>
			) : isPending ? (
				<p className="empty">불러오는 중…</p>
			) : notices.length === 0 ? (
				<p className="empty">공지가 없습니다</p>
			) : (
				<ul className="admin__rows">
					{notices.map((notice, index) => (
						<li
							key={notice.id}
							className={notice.isActive ? "notice" : "notice notice--off"}
						>
							{editing === notice.id ? (
								<div className="notice__form">
									<div className="notice__new">
										<textarea
											className="notice__input"
											value={edit.body ?? ""}
											rows={2}
											maxLength={200}
											onChange={(e) => setEdit({ ...edit, body: e.target.value })}
										/>
										<button
											type="button"
											className="chip chip--on"
											onClick={() =>
												patch.mutate({
													id: notice.id,
													patch: { ...edit, body: (edit.body ?? "").trim() },
												})
											}
										>
											저장
										</button>
										<button
											type="button"
											className="chip"
											onClick={() => setEditing(null)}
										>
											취소
										</button>
									</div>
									<div className="notice__meta">
										<label className="notice__field">
											분류
											<select
												className="notice__select"
												value={edit.category ?? "general"}
												onChange={(e) =>
													setEdit({ ...edit, category: e.target.value as NoticeCategory })
												}
											>
												<option value="general">일반</option>
												<option value="main">메인</option>
											</select>
										</label>
										<label className="notice__field">
											시작
											<input
												type="datetime-local"
												className="notice__select"
												value={toLocalInput(edit.startsAt ?? null)}
												onChange={(e) =>
													setEdit({ ...edit, startsAt: fromLocalInput(e.target.value) })
												}
											/>
										</label>
										<label className="notice__field">
											마감
											<input
												type="datetime-local"
												className="notice__select"
												value={toLocalInput(edit.endsAt ?? null)}
												onChange={(e) =>
													setEdit({ ...edit, endsAt: fromLocalInput(e.target.value) })
												}
											/>
										</label>
									</div>
								</div>
							) : (
								<>
									<span className="notice__body">
										{notice.category === "main" && (
											<span className="notice__badge">메인</span>
										)}
										{notice.body}
										{describeWindow(notice) && (
											<span className="notice__window">{describeWindow(notice)}</span>
										)}
										{notice.isActive && !isLive(notice, now) && (
											<span
												className="notice__window"
												title="켜져 있지만 기간 밖이라 지금은 화면에 뜨지 않습니다"
											>
												· 기간 밖
											</span>
										)}
									</span>
									<span className="notice__actions">
										<button
											type="button"
											className="chip"
											title="위로"
											disabled={index === 0}
											onClick={() => move(index, -1)}
										>
											↑
										</button>
										<button
											type="button"
											className="chip"
											title="아래로"
											disabled={index === notices.length - 1}
											onClick={() => move(index, 1)}
										>
											↓
										</button>
										<button
											type="button"
											className={notice.isActive ? "chip chip--on" : "chip"}
											onClick={() =>
												patch.mutate({
													id: notice.id,
													patch: { isActive: !notice.isActive },
												})
											}
										>
											{notice.isActive ? "사용" : "미사용"}
										</button>
										<button
											type="button"
											className="chip"
											onClick={() => {
												setEditing(notice.id);
												setEdit({
													body: notice.body,
													category: notice.category,
													startsAt: notice.startsAt,
													endsAt: notice.endsAt,
												});
											}}
										>
											수정
										</button>
										<button
											type="button"
											className="chip"
											onClick={() => setRemoving(notice)}
										>
											삭제
										</button>
									</span>
								</>
							)}
						</li>
					))}
				</ul>
			)}

			{removing && (
				<ConfirmDialog
					title="공지를 지울까요?"
					description={`"${removing.body}" — 되돌릴 수 없습니다. 잠깐 숨기려면 삭제 대신 사용을 끄세요.`}
					confirmLabel="지우기"
					onConfirm={() => remove.mutate(removing.id)}
					onCancel={() => setRemoving(null)}
				/>
			)}
		</>
	);
}
