import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STATUS_MAX_LENGTH } from "../src/api.ts";
import StatusDialog from "../src/StatusDialog.tsx";

function render(value: string | null): string {
	return renderToString(
		createElement(StatusDialog, {
			name: "조하나",
			value,
			saving: false,
			onSave: () => {},
			onCancel: () => {},
		}),
	);
}

describe("StatusDialog", () => {
	it("제한은 50자다", () => {
		// 유튜브 주소(짧게 20자)를 넣고도 글 쓸 자리가 남아야 한다
		expect(STATUS_MAX_LENGTH).toBe(50);
	});

	it("남은 수가 아니라 n/n 으로 보여준다", () => {
		expect(render("집중")).toContain("2/50");
	});

	it("제한을 넘기면 넘친 부분만 표시를 남긴다", () => {
		const over = "가".repeat(55);
		const html = render(over);

		expect(html).toContain("55/50");
		expect(html).toContain("dialog__hint--over");
		expect(html).toContain("dialog__over");
	});

	it("제한 안이면 넘침 표시가 비어 있다", () => {
		const html = render("집중");
		expect(html).not.toContain("dialog__hint--over");
		// mark 자체는 늘 있지만 안이 비어 있어야 한다
		expect(html).toContain('<mark class="dialog__over"></mark>');
	});

	it("제한을 넘기면 저장을 막는다", () => {
		const html = render("가".repeat(55));
		// 저장 버튼에 disabled 가 붙는다
		expect(html).toMatch(/dialog__button--primary"[^>]*disabled/);
	});

	it("제한 안이면 저장할 수 있다", () => {
		const html = render("집중");
		expect(html).not.toMatch(/dialog__button--primary"[^>]*disabled/);
	});
});
