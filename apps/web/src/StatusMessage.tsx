import { useEffect, useRef, useState } from "react";

import { STATUS_MAX_LENGTH } from "./api.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";

/**
 * 한 번 확인하면 이 페이지가 열려 있는 동안은 다시 묻지 않는다.
 * 매번 물으면 수정할 때마다 걸리적거린다.
 */
let confirmedOnce = false;

interface Props {
	value: string | null;
	dimmed: boolean;
	onSave: (message: string) => Promise<void>;
}

export default function StatusMessage({ value, dimmed, onSave }: Props) {
	const [editing, setEditing] = useState(false);
	const [asking, setAsking] = useState(false);
	const [draft, setDraft] = useState(value ?? "");
	const [saving, setSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	function beginEdit() {
		setDraft(value ?? "");
		setEditing(true);
	}

	function startEditing() {
		if (confirmedOnce) {
			beginEdit();
			return;
		}
		setAsking(true);
	}

	async function commit() {
		const next = draft.trim();

		if (next === (value ?? "")) {
			setEditing(false);
			return;
		}

		setSaving(true);
		try {
			await onSave(next);
			setEditing(false);
		} catch {
			// 실패 사유는 toast 가 알린다. 입력한 내용을 잃지 않도록 편집 상태를 유지한다.
		} finally {
			setSaving(false);
		}
	}

	if (asking) {
		return (
			<>
				<StatusButton value={value} dimmed={dimmed} onClick={startEditing} />
				<ConfirmDialog
					title="본인입니까?"
					description="상태 메시지는 누구나 바꿀 수 있습니다. 본인 것만 작성해 주세요."
					onConfirm={() => {
						confirmedOnce = true;
						setAsking(false);
						beginEdit();
					}}
					onCancel={() => setAsking(false)}
				/>
			</>
		);
	}

	if (editing) {
		return (
			<span className="status status--editing">
				<input
					ref={inputRef}
					className="status__input"
					value={draft}
					maxLength={STATUS_MAX_LENGTH}
					disabled={saving}
					placeholder="상태 메시지"
					aria-label="상태 메시지"
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") commit();
						if (event.key === "Escape") setEditing(false);
					}}
				/>
			</span>
		);
	}

	return <StatusButton value={value} dimmed={dimmed} onClick={startEditing} />;
}

function StatusButton({
	value,
	dimmed,
	onClick,
}: {
	value: string | null;
	dimmed: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={dimmed ? "status status--dim" : "status"}
			onClick={onClick}
			title="상태 메시지 수정"
		>
			{value ? value : <span className="status__empty">+ 상태</span>}
		</button>
	);
}
