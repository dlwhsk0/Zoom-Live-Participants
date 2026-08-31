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

	const targets = action.detail.targets ?? [];
	const before = [...new Set(targets.map((t) => t.before ?? "(이름 없음)"))];
	return `${before.join(", ")} → ${action.detail.after ?? "?"}`;
}

/**
 * 어드민이 고친 기록.
 *
 * 이전 값을 함께 담아 두었으므로 rename 은 되돌릴 수 있다.
 * 되돌린 것도 기록에 남는다.
 */
export default function AdminActions({
	accessKey,
	onToast,
}: {
	accessKey: string;
	onToast: (message: string, ok: boolean) => void;
}) {
	const queryClient = useQueryClient();

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["adminActions", accessKey],
		queryFn: () => fetchAdminActions(accessKey),
		retry: false,
	});

	const undo = useMutation({
		mutationFn: (actionId: string) => undoAdminAction({ key: accessKey, actionId }),
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
					{action.action === "rename" && (
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
