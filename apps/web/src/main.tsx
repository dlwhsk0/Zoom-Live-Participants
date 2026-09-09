import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import Admin from "./Logs.tsx";
import "./styles.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// 폴링으로 갱신하므로 재시도를 짧게 가져간다
			retry: 1,
			refetchOnWindowFocus: true,
		},
	},
});

const container = document.getElementById("root");
if (!container) {
	throw new Error("#root not found");
}

/**
 * 어드민 화면의 주소.
 *
 * **레포가 공개라 여기에 진짜 주소를 적으면 그 순간 공개된다.** 그래서 값은
 * 환경변수로 받고 코드에는 기본값만 둔다. 감추고 싶으면 배포 환경변수에 넣는다.
 *
 * 그리고 주소를 감추는 것은 자물쇠가 아니다. 이 화면은 로그인으로 막혀 있고,
 * 주소는 그 위에 얹는 얇은 한 겹일 뿐이다.
 */
function adminPath(): string {
	const raw = import.meta.env.VITE_ADMIN_PATH?.trim() || "/admin";
	const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
	return withSlash.replace(/\/+$/, "") || "/admin";
}

// 화면이 둘뿐이라 라우터를 쓰지 않는다.
const isAdmin =
	window.location.pathname.replace(/\/+$/, "") === adminPath();

createRoot(container).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			{isAdmin ? <Admin /> : <App />}
		</QueryClientProvider>
	</StrictMode>,
);
