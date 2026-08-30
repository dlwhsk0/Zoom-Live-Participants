import { describe, expect, it } from "vitest";

import { nextTheme, THEME_LABEL } from "../src/theme.ts";

describe("theme", () => {
	it("system → light → dark → system 순으로 돈다", () => {
		expect(nextTheme("system")).toBe("light");
		expect(nextTheme("light")).toBe("dark");
		expect(nextTheme("dark")).toBe("system");
	});

	it("세 번 돌면 제자리로 온다", () => {
		expect(nextTheme(nextTheme(nextTheme("system")))).toBe("system");
	});

	it("모든 테마에 이름이 있다", () => {
		for (const theme of ["system", "light", "dark"] as const) {
			expect(THEME_LABEL[theme]).toBeTruthy();
		}
	});
});
