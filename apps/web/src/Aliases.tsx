import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
	deleteAlias,
	fetchAliasSuggestions,
	fetchAliases,
	putAlias,
} from "./api.ts";

/**
 * 표시 이름 별칭.
 *
 * 고정 닉네임을 쓰는 사람을 한 명으로 묶는다. 예: Chloe = 이도경.
 * 사람 탭의 행 수정과 역할이 다르다 — 저쪽은 그 세션의 특정 행만
 * 고치는 일회성 교정이고, 이쪽은 모든 세션에 계속 적용된다.
 */
export default function Aliases({
	onToast,
}: {
	onToast: (message: string, ok: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [alias, setAlias] = useState("");
	const [canonical, setCanonical] = useState("");

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["aliases"],
		queryFn: fetchAliases,
		retry: false,
	});

	function refresh() {
		void queryClient.invalidateQueries({ queryKey: ["aliases"] });
		void queryClient.invalidateQueries({ queryKey: ["identities"] });
		void queryClient.invalidateQueries({ queryKey: ["adminActions"] });
		void queryClient.invalidateQueries({ queryKey: ["aliasSuggestions"] });
	}

	const add = useMutation({
		mutationFn: () =>
			putAlias({ alias: alias.trim(), canonical: canonical.trim() }),
		onSuccess: () => {
			onToast(`${alias.trim()} 을(를) ${canonical.trim()} 로 묶었습니다`, true);
			setAlias("");
			setCanonical("");
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	// 같은 기기인데 이름이 다른 쌍. 합치는 것은 사람이 누른다.
	const suggestions = useQuery({
		queryKey: ["aliasSuggestions"],
		queryFn: fetchAliasSuggestions,
		retry: false,
	});

	const accept = useMutation({
		mutationFn: (input: { alias: string; canonical: string }) => putAlias(input),
		onSuccess: (_data, input) => {
			onToast(`${input.alias} 을(를) ${input.canonical} 로 묶었습니다`, true);
			refresh();
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	const remove = useMutation({
		mutationFn: (target: string) => deleteAlias({ alias: target }),
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

	const suggested = suggestions.data ?? [];

	const proposals = suggested.length > 0 && (
		<div className="suggest">
			<p className="suggest__title">
				같은 기기에서 다른 이름을 쓴 기록이 있습니다. 한 사람이 이름을 바꾼
				것이라면 묶어 주세요.
			</p>
			<ul className="suggest__list">
				{suggested.flatMap((group) =>
					group.aliases.map((item) => (
						<li key={`${group.privateIp}|${item.name}`} className="suggest__row">
							<span className="suggest__pair">
								<b>{item.name}</b>
								<span className="admin__arrow">→</span>
								<b>{group.canonical}</b>
							</span>
							{/* 근거를 밝힌다. 왜 이 둘을 묶자는지 보이지 않으면 누를 수 없다 */}
							<span className="suggest__why">{`같은 기기 ${group.privateIp}`}</span>
							<button
								type="button"
								className="admin__apply"
								disabled={accept.isPending}
								onClick={() =>
									accept.mutate({ alias: item.name, canonical: group.canonical })
								}
							>
								묶기
							</button>
						</li>
					)),
				)}
			</ul>
		</div>
	);

	return (
		<>
			{hint}
			{form}
			{proposals}

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
