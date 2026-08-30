import { useEffect } from "react";

export type ToastTone = "success" | "error";

export interface ToastState {
	/** 같은 문구가 연달아 떠도 다시 보이도록 매번 새 키를 준다. */
	key: number;
	tone: ToastTone;
	message: string;
}

const AUTO_DISMISS_MS = 2600;

export default function Toast({
	toast,
	onDismiss,
}: {
	toast: ToastState | null;
	onDismiss: () => void;
}) {
	const key = toast?.key;

	useEffect(() => {
		if (key === undefined) return;
		const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
		return () => window.clearTimeout(timer);
	}, [key, onDismiss]);

	if (!toast) return null;

	return (
		<div
			className={`toast toast--${toast.tone}`}
			role="status"
			aria-live="polite"
			onClick={onDismiss}
		>
			<span className="toast__mark" aria-hidden="true">
				{toast.tone === "success" ? "✓" : "!"}
			</span>
			{toast.message}
		</div>
	);
}
