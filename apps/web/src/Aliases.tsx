import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteAlias, fetchAliases, putAlias } from "./api.ts";

/**
 * 표시 이름 별칭.
 *
 * 고정 닉네임을 쓰는 사람을 한 명으로 묶는다. 예: Chloe = 이도경.
 * 사람 탭의 행 수정과 역할이 다르다 — 저쪽은 그 세션의 특정 행만
 * 고치는 일회성 교정이고, 이쪽은 모든 세션에 계속 적용된다.
 */
export default function Aliases({
	accessKey,
	onToast,
}: {
	accessKey: string;
	onToast: (message: string, ok: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [alias, setAlias] = useState("");
	const [canonical, setCanonical] = useState("");

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["aliases", accessKey],
		queryFn: () => fetchAliases(accessKey),
		retry: false,
	});

	function refresh() {
		void queryClient.invalidateQueries({ queryKey: ["aliases"] });
		void queryClient.invalidateQueries({ queryKey: ["identities"] });
		void queryClient.invalidateQueries({ queryKey: ["adminActions"] });
	}

	const add = useMutation({
		mutationFn: () =>
			putAlias({ key: accessKey, alias: alias.trim(), canonical: canonical.trim() }),
		onSuccess: () => {
			onToast(`${alias.trim()} 을(를) ${canonical.trim()} 로 묶었습니다`, true);
			setAlias("");
			setCanonical("");
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	const remove = useMutation({
		mutationFn: (target: string) => deleteAlias({ key: accessKey, alias: target }),
		onSuccess: () => {
			onToast("별칭을 지웠습니다", true);
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	const hint = (
		<p className="admin__hint">
			고정 닉네임을 쓰는 사람을 묶습니다. 모든 회의에 계속 적용됩니다. 사람
			탭의 이름 수정은 그 세션에만 적용되는 일회성 교정입니다.
		</p>
	);

	const form = (
		<div className="admin__aliasForm">
			<input
				className="admin__input"
				value={alias}
				placeholder="줌에 뜨는 이름"
				aria-label="줌에 뜨는 이름"
				onChange={(event) => setAlias(event.target.value)}
			/>
			<span className="admin__arrow">→</span>
			<input
				className="admin__input"
				value={canonical}
				placeholder="대표 이름"
				aria-label="대표 이름"
				onChange={(event) => setCanonical(event.target.value)}
			/>
			<button
				type="button"
				className="admin__apply"
				disabled={
					add.isPending || alias.trim().length === 0 || canonical.trim().length === 0
				}
				onClick={() => add.mutate()}
			>
				{add.isPending ? "…" : "추가"}
			</button>
		</div>
	);

	if (isError) {
		return (
			<>
				{hint}
				{form}
				<p className="empty">
					{error instanceof Error ? error.message : "불러오지 못했습니다"}
				</p>
			</>
		);
	}

	return (
		<>
			{hint}
			{form}

			{isPending ? (
				<p className="empty">불러오는 중…</p>
			) : data.length === 0 ? (
				<p className="empty">등록된 별칭이 없습니다</p>
			) : (
				<ul className="admin__rows">
					{data.map((row) => (
						<li key={row.alias} className="admin__action">
							<span className="admin__desc">
								{row.alias} <span className="admin__arrow">→</span> {row.canonical}
							</span>
							<button
								type="button"
								className="admin__undo"
								disabled={remove.isPending}
								onClick={() => remove.mutate(row.alias)}
							>
								지우기
							</button>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
