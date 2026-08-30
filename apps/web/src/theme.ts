export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "zlp-theme";

export function readTheme(): Theme {
	try {
		const saved = window.localStorage.getItem(STORAGE_KEY);
		if (saved === "light" || saved === "dark" || saved === "system") {
			return saved;
		}
	} catch {
		// 사생활 보호 모드 등에서 접근이 막힐 수 있다. 기본값으로 둔다.
	}
	return "system";
}

export function applyTheme(theme: Theme): void {
	const root = document.documentElement;

	if (theme === "system") {
		root.removeAttribute("data-theme");
	} else {
		root.setAttribute("data-theme", theme);
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// 저장에 실패해도 현재 화면에는 적용된다
	}
}

/** system → light → dark → system 순으로 돈다. */
export function nextTheme(theme: Theme): Theme {
	if (theme === "system") return "light";
	if (theme === "light") return "dark";
	return "system";
}

export const THEME_LABEL: Record<Theme, string> = {
	system: "시스템",
	light: "라이트",
	dark: "다크",
};
