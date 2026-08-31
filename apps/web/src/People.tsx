import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
	fetchIdentities,
	renameIdentities,
	type Identity,
} from "./api.ts";

function formatTime(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString("ko-KR", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

/**
 * 합치기 전의 원본 행을 이름별로 묶어 보여준다.
 *
 * 화면(/)의 목록은 이미 합쳐진 결과라 어느 행이 문제인지 알 수 없다.
 * 여기서는 손대지 않은 행을 그대로 보여준다.
 */
function groupByName(identities: Identity[]): [string, Identity[]][] {
	const groups = new Map<string, Identity[]>();

	for (const identity of identities) {
		const name = identity.displayName ?? "(이름 없음)";
		const list = groups.get(name) ?? [];
		list.push(identity);
		groups.set(name, list);
	}

	// 행이 여럿인 이름을 위로. 같은 사람인지 확인할 일이 가장 많다.
	return [...groups.entries()].sort((a, b) => {
		if (a[1].length !== b[1].length) return b[1].length - a[1].length;
		return a[0].localeCompare(b[0]);
	});
}

export default function People({
	accessKey,
	onToast,
}: {
	accessKey: string;
	onToast: (message: string, ok: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [name, setName] = useState("");

	const { data, isPending, isError, error } = useQuery({
		queryKey: ["identities", accessKey],
		queryFn: () => fetchIdentities(accessKey),
		retry: false,
	});

	const groups = useMemo(
		() => groupByName(data?.identities ?? []),
		[data?.identities],
	);

	const rename = useMutation({
		mutationFn: (displayName: string) =>
			renameIdentities({
				key: accessKey,
				meetingUuid: data?.meetingUuid ?? "",
				participantUuids: [...picked],
				displayName,
			}),
		onSuccess: (result) => {
			onToast(`${result.changed}개 행의 이름을 바꿨습니다`, true);
			setPicked(new Set());
			setName("");
			void queryClient.invalidateQueries({ queryKey: ["identities"] });
			void queryClient.invalidateQueries({ queryKey: ["adminActions"] });
		},
		onError: (err: Error) => onToast(err.message, false),
	});

	function toggle(uuid: string, suggested: string | null) {
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(uuid)) next.delete(uuid);
			else next.add(uuid);
			return next;
		});
		// 처음 고른 행의 이름을 기본값으로 채워 준다
		if (picked.size === 0 && suggested) setName(suggested);
	}

	// 안내는 목록보다 먼저 나온다. 무엇을 하는 화면인지부터 알아야 한다.
	const hint = (
		<p className="admin__hint">
			같은 사람의 행을 고르고 이름을 하나로 맞추면 합쳐집니다. 잘못 합쳐진
			사람은 한쪽에 다른 이름을 주면 떨어집니다. 원본 로그는 바뀌지 않습니다.
		</p>
	);

	if (isError) {
		return (
			<>
				{hint}
				<p className="empty">
					{error instanceof Error ? error.message : "불러오지 못했습니다"}
				</p>
			</>
		);
	}
	if (isPending) {
		return (
			<>
				{hint}
				<p className="empty">불러오는 중…</p>
			</>
		);
	}
	if (groups.length === 0) {
		return (
			<>
				{hint}
				<p className="empty">참가자가 없습니다</p>
			</>
		);
	}

	return (
		<>
			{hint}

			{groups.map(([groupName, rows]) => (
				<section key={groupName} className="admin__group">
					<h3 className="admin__groupName">
						{groupName}
						<span className="admin__count">{rows.length}행</span>
					</h3>

					<ul className="admin__rows">
						{rows.map((row) => (
							<li key={row.participantUuid} className="admin__row">
								<label className="admin__pick">
									<input
										type="checkbox"
										checked={picked.has(row.participantUuid)}
										onChange={() => toggle(row.participantUuid, row.displayName)}
									/>
									<span className={row.isPresent ? "admin__dot admin__dot--on" : "admin__dot"} />
									<span className="admin__span">
										{formatTime(row.firstJoinedAt)} ~ {formatTime(row.lastOccurredAt)}
									</span>
								</label>
								<span className="admin__mono">{row.publicIp ?? "-"}</span>
								<span className="admin__mono">{row.participantUuid.slice(0, 8)}</span>
							</li>
						))}
					</ul>
				</section>
			))}

			{picked.size > 0 && (
				<div className="admin__bar">
					<span className="admin__picked">{picked.size}행 선택</span>
					<input
						className="admin__input"
						value={name}
						placeholder="맞출 이름"
						aria-label="맞출 이름"
						onChange={(event) => setName(event.target.value)}
					/>
					<button
						type="button"
						className="admin__apply"
						disabled={rename.isPending || name.trim().length === 0}
						onClick={() => rename.mutate(name.trim())}
					>
						{rename.isPending ? "적용 중" : "적용"}
					</button>
					<button
						type="button"
						className="admin__cancel"
						onClick={() => {
							setPicked(new Set());
							setName("");
						}}
					>
						취소
					</button>
				</div>
			)}
		</>
	);
}
