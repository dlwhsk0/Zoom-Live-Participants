import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
	createNotice,
	deleteNotice,
	fetchAdminNotices,
	patchNotice,
	type AdminNotice,
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
export default function Notices({
	onToast,
}: {
	onToast: (message: string, ok: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState("");
	const [editing, setEditing] = useState<string | null>(null);
	const [editText, setEditText] = useState("");
	const [removing, setRemoving] = useState<AdminNotice | null>(null);

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
		mutationFn: () => createNotice(draft.trim()),
		onSuccess: () => {
			onToast("공지를 추가했습니다", true);
			setDraft("");
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	const patch = useMutation({
		mutationFn: (input: {
			id: string;
			patch: { body?: string; sortOrder?: number; isActive?: boolean };
		}) => patchNotice(input.id, input.patch),
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
	const shown = notices.filter((n) => n.isActive).length;

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
				중입니다. 내리면 화면에서만 빠지고 기록은 남습니다.
			</p>

			<div className="notice__new">
				<input
					className="notice__input"
					value={draft}
					maxLength={200}
					placeholder="새 공지 (200자까지)"
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && draft.trim()) add.mutate();
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
								<div className="notice__new">
									<input
										className="notice__input"
										value={editText}
										maxLength={200}
										onChange={(e) => setEditText(e.target.value)}
									/>
									<button
										type="button"
										className="chip chip--on"
										onClick={() =>
											patch.mutate({
												id: notice.id,
												patch: { body: editText.trim() },
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
							) : (
								<>
									<span className="notice__body">{notice.body}</span>
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
											{notice.isActive ? "보임" : "내림"}
										</button>
										<button
											type="button"
											className="chip"
											onClick={() => {
												setEditing(notice.id);
												setEditText(notice.body);
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
					description={`"${removing.body}" — 되돌릴 수 없습니다. 잠깐 숨기려면 삭제 대신 내리기를 쓰세요.`}
					confirmLabel="지우기"
					onConfirm={() => remove.mutate(removing.id)}
					onCancel={() => setRemoving(null)}
				/>
			)}
		</>
	);
}
