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

/** 빈 값과 지운 것을 구분해서 보여준다. 둘 다 "없음" 이지만 뜻이 다르다. */
function quote(value: string | null | undefined, empty: string): string {
	if (value === null || value === undefined || value === "") return empty;
	return `“${value}”`;
}

/** 누가 했는가. 이름을 못 찾으면 IP 를 그대로 쓴다. */
function actorLabel(action: AdminAction): string {
	if (action.actor.name) return action.actor.name;
	if (action.actor.candidates > 1) return `${action.actor.candidates}명 중 한 명`;
	return action.actor.ip ?? "알 수 없음";
}

/** 무엇을 했는가. 대상이 있는 것과 없는 것(별칭)을 나눈다. */
function describe(action: AdminAction): { target: string; change: string } {
	if (action.action === "undo") {
		const n = action.detail.restored?.length ?? 0;
		return { target: "되돌리기", change: `${n}행을 이전 값으로` };
	}

	if (action.action === "alias.put") {
		return {
			target: "별칭",
			change: `${action.detail.alias} → ${action.detail.canonical}`,
		};
	}

	if (action.action === "alias.delete") {
		return {
			target: "별칭 지움",
			change: `${action.detail.alias} → ${action.detail.canonical}`,
		};
	}

	const first = action.targets[0];
	const who = first?.displayName ?? "알 수 없는 사람";

	if (action.action === "status") {
		return {
			target: `${who} 님의 상태 메시지`,
			change: `${quote(first?.before, "(비어 있음)")} → ${quote(action.detail.after, "(지움)")}`,
		};
	}

	// rename. 여러 행을 한 번에 고칠 수 있다.
	const names = [...new Set(action.targets.map((t) => t.before ?? "(이름 없음)"))];
	return {
		target: `이름 ${action.targets.length}행`,
		change: `${names.join(", ")} → ${action.detail.after ?? "?"}`,
	};
}

/**
 * 누가 고쳤는가.
 *
 * 상태 메시지는 아무나 고칠 수 있게 열어 뒀다. 막는 대신 **누가 고쳤는지를
 * 남기는 것**이 이 화면의 목적이다. 그래서 "무엇이 바뀌었나" 보다 "누가
 * 누구를" 이 먼저 온다.
 *
 * 로그인이 없으므로 아는 것은 IP 뿐이다. 같은 세션에서 그 IP 로 접속한
 * 사람이 한 명뿐일 때만 이름을 붙이고, 여럿이면 수만 알린다.
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
		return (
			<p className="empty">
				{error instanceof Error ? error.message : "불러오지 못했습니다"}
			</p>
		);
	}
	if (isPending) return <p className="empty">불러오는 중…</p>;
	if (data.length === 0) return <p className="empty">고친 기록이 없습니다</p>;

	return (
		<>
			<p className="admin__hint">
				상태 메시지는 누구나 고칠 수 있습니다. 대신 누가 고쳤는지가 여기 남습니다.
				이름은 접속 IP 로 찾은 것이라, 같은 네트워크를 여럿이 쓰면 특정하지 않습니다.
			</p>

			<ul className="admin__rows">
				{data.map((action) => {
					const { target, change } = describe(action);
					const named = Boolean(action.actor.name);

					return (
						<li key={action.id} className="record">
							<div className="record__head">
								<span className="record__time">{formatTime(action.createdAt)}</span>
								<span className={named ? "record__actor" : "record__actor record__actor--unknown"}>
									{actorLabel(action)}
								</span>
								<span className="record__arrow" aria-hidden="true">
									→
								</span>
								<span className="record__target">{target}</span>

								{/* 서버가 되돌릴 수 있는 것과 같은 목록이어야 한다
								    (repository/admin.ts 의 undoAction) */}
								{(action.action === "rename" || action.action === "status") && (
									<button
										type="button"
										className="record__undo"
										disabled={undo.isPending}
										onClick={() => undo.mutate(action.id)}
									>
										되돌리기
									</button>
								)}
							</div>

							<div className="record__body">
								{action.actor.ip && (
									<span className="record__ip" title="이 IP 에서 고쳤습니다">
										{action.actor.ip}
									</span>
								)}
								<span className="record__change">{change}</span>
							</div>
						</li>
					);
				})}
			</ul>
		</>
	);
}
