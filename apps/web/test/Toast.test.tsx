import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Toast, { type ToastState } from "../src/Toast.tsx";

function render(toast: ToastState | null): string {
	return renderToString(
		createElement(Toast, { toast, onDismiss: () => {} }),
	);
}

describe("Toast", () => {
	it("성공 알림을 보여준다", () => {
		const html = render({ key: 1, tone: "success", message: "상태 메시지를 저장했습니다" });
		expect(html).toContain("상태 메시지를 저장했습니다");
		expect(html).toContain("toast--success");
	});

	it("실패 알림을 보여준다", () => {
		const html = render({ key: 2, tone: "error", message: "저장 실패" });
		expect(html).toContain("저장 실패");
		expect(html).toContain("toast--error");
	});

	it("알림이 없으면 아무것도 그리지 않는다", () => {
		expect(render(null)).toBe("");
	});

	it("스크린리더에 알리도록 표시한다", () => {
		const html = render({ key: 3, tone: "success", message: "저장" });
		expect(html).toContain('role="status"');
		expect(html).toContain('aria-live="polite"');
	});
});
