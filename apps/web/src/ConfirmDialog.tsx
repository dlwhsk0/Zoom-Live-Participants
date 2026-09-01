import { useEffect, useRef } from "react";
import Portal from "./Portal.tsx";

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

	// 열릴 때 한 번만. 의존성에 onCancel 을 두면 매 렌더 다시 돌아
	// 사용자가 옮겨 놓은 초점을 1초마다 빼앗는다.
	useEffect(() => {
		confirmRef.current?.focus();
	}, []);

	const cancelRef = useRef(onCancel);
	cancelRef.current = onCancel;

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") cancelRef.current();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<Portal>
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
		</Portal>
	);
}
