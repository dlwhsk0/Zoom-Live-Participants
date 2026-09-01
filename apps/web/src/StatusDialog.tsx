import { useEffect, useRef, useState } from "react";

import { STATUS_MAX_LENGTH } from "./api.ts";
import Portal from "./Portal.tsx";

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
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// 창이 열릴 때 한 번만 커서를 잡는다.
	//
	// 예전에는 이 안에서 select() 까지 하고 의존성에 onCancel 을 두었다.
	// onCancel 은 매 렌더 새로 만들어지는 함수라 효과가 매번 다시 돌았고,
	// 목록이 1초마다 리렌더되므로 1초마다 전체 선택이 걸렸다.
	// 그 상태에서 한 글자를 치면 적던 내용이 통째로 날아갔다.
	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;

		input.focus();
		// 전체 선택 대신 끝으로 보낸다. 이어 적는 것이 지우는 것보다 흔하다.
		input.setSelectionRange(input.value.length, input.value.length);
	}, []);

	// 리스너도 한 번만 건다. 최신 onCancel 은 ref 로 집는다.
	const cancelRef = useRef(onCancel);
	cancelRef.current = onCancel;

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") cancelRef.current();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const over = draft.length > STATUS_MAX_LENGTH;

	return (
		<Portal>
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

					{/*
					  * 넘친 글자를 빨갛게 칠하려면 글자 하나하나에 스타일을 줘야 하는데
					  * input 안의 텍스트에는 줄 수 없다. 같은 글을 그린 거울을 뒤에 깔고
					  * 입력칸은 글자를 투명하게 해서 위에 얹는다. 커서만 보인다.
					  *
					  * 한 줄짜리 input 이 아니라 textarea 인 이유는 가로 스크롤 때문이다.
					  * 스크롤되면 거울과 어긋난다. 줄바꿈으로 받으면 항상 붙어 있다.
					  */}
					<div className="dialog__field">
						<div className="dialog__mirror" aria-hidden="true">
							{draft.slice(0, STATUS_MAX_LENGTH)}
							<mark className="dialog__over">
								{draft.slice(STATUS_MAX_LENGTH)}
							</mark>
						</div>
						<textarea
							ref={inputRef}
							className="dialog__input"
							value={draft}
							rows={2}
							disabled={saving}
							placeholder="예: 논문 마감 중"
							aria-label="상태 메시지"
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;
								// 상태 메시지는 한 줄짜리다. 줄바꿈 대신 저장으로 받는다.
								event.preventDefault();
								if (!saving && !over) onSave(draft.trim());
							}}
						/>
					</div>
					<p className={over ? "dialog__hint dialog__hint--over" : "dialog__hint"}>
						{`${draft.length}/${STATUS_MAX_LENGTH}`}
					</p>

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
							disabled={saving || over}
							onClick={() => onSave(draft.trim())}
						>
							{saving ? "저장 중" : "저장"}
						</button>
					</div>
				</div>
			</div>
		</Portal>
	);
}
