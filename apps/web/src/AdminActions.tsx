import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminActions, undoAdminAction, type AdminAction } from "./api.ts";

function formatTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("ko-KR", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function describe(action: AdminAction): string {
	if (action.action === "undo") {
		const n = action.detail.restored?.length ?? 0;
		return `되돌림 · ${n}행`;
	}

	if (action.action === "alias.put") {
		return `별칭 ${action.detail.alias} → ${action.detail.canonical}`;
	}

	if (action.action === "alias.delete") {
		return `별칭 지움 ${action.detail.alias} → ${action.detail.canonical}`;
	}

	const targets = action.detail.targets ?? [];

	// 상태 메시지는 어드민이 아니라 참가자가 바꾼 것이다. 빈 값도 정상이라
	// 이름 쪽 문구("이름 없음")를 그대로 쓰면 엉뚱하게 읽힌다.
	if (action.action === "status") {
		const before = targets[0]?.before ?? "(비어 있음)";
		const after = action.detail.after ?? "(지움)";
		return `상태 ${before} → ${after}`;
	}

	const before = [...new Set(targets.map((t) => t.before ?? "(이름 없음)"))];
	return `${before.join(", ")} → ${action.detail.after ?? "?"}`;
}

/**
 * 고쳐진 기록.
 *
 * 어드민이 한 것(rename)과 참가자가 한 것(status)이 함께 쌓인다.
 * 이전 값을 같이 담아 두므로 둘 다 되돌릴 수 있다.
 * 되돌린 것도 기록에 남는다.
 */
export default function AdminActions({
	onToast,
}: {
	onToast: (message: string, ok: boolean) => void;
}) {
	const queryClient = useQueryClient();

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["adminActions"],
		queryFn: fetchAdminActions,
		retry: false,
	});

	const undo = useMutation({
		mutationFn: (actionId: string) => undoAdminAction({ actionId }),
		onSuccess: (result) => {
			onToast(`${result.restored}행을 되돌렸습니다`, true);
			void queryClient.invalidateQueries({ queryKey: ["identities"] });
			void queryClient.invalidateQueries({ queryKey: ["adminActions"] });
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	if (isError) {
		return <p className="empty">{error instanceof Error ? error.message : "불러오지 못했습니다"}</p>;
	}
	if (isPending) return <p className="empty">불러오는 중…</p>;
	if (data.length === 0) return <p className="empty">고친 기록이 없습니다</p>;

	return (
		<ul className="admin__rows">
			{data.map((action) => (
				<li key={action.id} className="admin__action">
					<span className="admin__span">{formatTime(action.createdAt)}</span>
					<span className="admin__desc">{describe(action)}</span>
					{/* 서버가 되돌릴 수 있는 것과 같은 목록이어야 한다.
					    (repository/admin.ts 의 undoAction) */}
					{(action.action === "rename" || action.action === "status") && (
						<button
							type="button"
							className="admin__undo"
							disabled={undo.isPending}
							onClick={() => undo.mutate(action.id)}
						>
							되돌리기
						</button>
					)}
				</li>
			))}
		</ul>
	);
}
