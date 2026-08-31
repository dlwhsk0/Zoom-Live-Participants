import { useEffect, useRef, useState } from "react";

import { STATUS_MAX_LENGTH } from "./api.ts";

interface Props {
	name: string;
	value: string | null;
	saving: boolean;
	onSave: (message: string) => void;
	onCancel: () => void;
}

/**
 * 상태 메시지를 고치는 창.
 *
 * 타일 한 칸이 90px 남짓이라 그 안에 입력칸을 두면 글자가 거의 안 보인다.
 * 확인 창과 같은 모양으로 띄운다.
 */
export default function StatusDialog({
	name,
	value,
	saving,
	onSave,
	onCancel,
}: Props) {
	const [draft, setDraft] = useState(value ?? "");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();

		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") onCancel();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onCancel]);

	const left = STATUS_MAX_LENGTH - draft.length;

	return (
		<div
			className="overlay"
			role="dialog"
			aria-modal="true"
			aria-labelledby="status-title"
			onClick={(event) => {
				if (event.target === event.currentTarget) onCancel();
			}}
		>
			<div className="dialog">
				<h2 className="dialog__title" id="status-title">
					{name}
				</h2>
				<p className="dialog__body">상태 메시지를 적어주세요.</p>

				<input
					ref={inputRef}
					className="dialog__input"
					value={draft}
					maxLength={STATUS_MAX_LENGTH}
					disabled={saving}
					placeholder="예: 논문 마감 중"
					aria-label="상태 메시지"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !saving) onSave(draft.trim());
					}}
				/>
				<p className="dialog__hint">{left}자 남음</p>

				<div className="dialog__actions">
					<button
						type="button"
						className="dialog__button"
						disabled={saving}
						onClick={onCancel}
					>
						취소
					</button>
					<button
						type="button"
						className="dialog__button dialog__button--primary"
						disabled={saving}
						onClick={() => onSave(draft.trim())}
					>
						{saving ? "저장 중" : "저장"}
					</button>
				</div>
			</div>
		</div>
	);
}
