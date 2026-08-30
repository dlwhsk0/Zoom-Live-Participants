import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ConfirmDialog from "../src/ConfirmDialog.tsx";

const html = renderToString(
	createElement(ConfirmDialog, {
		title: "본인입니까?",
		description: "상태 메시지는 누구나 바꿀 수 있습니다. 본인 것만 작성해 주세요.",
		onConfirm: () => {},
		onCancel: () => {},
	}),
);

describe("ConfirmDialog", () => {
	it("제목과 설명을 보여준다", () => {
		expect(html).toContain("본인입니까?");
		expect(html).toContain("본인 것만 작성해 주세요");
	});

	it("확인과 취소 버튼이 있다", () => {
		expect(html).toContain("네, 본인입니다");
		expect(html).toContain("취소");
	});

	it("모달 접근성 속성을 갖춘다", () => {
		expect(html).toContain('role="dialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('aria-labelledby="confirm-title"');
	});

	it("테마 토큰을 쓰는 클래스를 붙인다", () => {
		expect(html).toContain("overlay");
		expect(html).toContain("dialog");
	});
});
