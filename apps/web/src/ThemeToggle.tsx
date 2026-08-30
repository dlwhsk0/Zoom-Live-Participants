import { useEffect, useState } from "react";

import { applyTheme, nextTheme, readTheme, THEME_LABEL, type Theme } from "./theme.ts";

const ICON: Record<Theme, string> = {
	system: "◐",
	light: "☀",
	dark: "☾",
};

export default function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("system");

	// 초기값은 브라우저에서만 알 수 있다. 서버 렌더 시에는 시스템 설정을 따른다.
	useEffect(() => {
		const saved = readTheme();
		setTheme(saved);
		applyTheme(saved);
	}, []);

	function cycle() {
		const next = nextTheme(theme);
		setTheme(next);
		applyTheme(next);
	}

	return (
		<button
			type="button"
			className="theme-toggle"
			onClick={cycle}
			aria-label={`화면 테마: ${THEME_LABEL[theme]}`}
			title={`화면 테마: ${THEME_LABEL[theme]}`}
		>
			<span aria-hidden="true">{ICON[theme]}</span>
		</button>
	);
}
