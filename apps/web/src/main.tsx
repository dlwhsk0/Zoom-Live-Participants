import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
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

createRoot(container).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
);
