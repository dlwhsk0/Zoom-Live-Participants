import { useEffect, useRef } from "react";

interface Props {
	title: string;
	description: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * 화면 테마를 따르는 확인 창.
 *
 * window.confirm 은 브라우저 기본 스타일이라 다크 모드에서 튄다.
 */
export default function ConfirmDialog({
	title,
	description,
	confirmLabel = "네, 본인입니다",
	cancelLabel = "취소",
	onConfirm,
	onCancel,
}: Props) {
	const confirmRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		confirmRef.current?.focus();

		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") onCancel();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onCancel]);

	return (
		<div
			className="overlay"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			onClick={(event) => {
				// 바깥을 누르면 닫는다
				if (event.target === event.currentTarget) onCancel();
			}}
		>
			<div className="dialog">
				<h2 className="dialog__title" id="confirm-title">
					{title}
				</h2>
				<p className="dialog__body">{description}</p>
				<div className="dialog__actions">
					<button type="button" className="dialog__button" onClick={onCancel}>
						{cancelLabel}
					</button>
					<button
						ref={confirmRef}
						type="button"
						className="dialog__button dialog__button--primary"
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
