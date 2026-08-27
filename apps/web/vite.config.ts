import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		// 로컬 개발 시 API 를 별도 포트에서 띄우고 프록시로 붙인다.
		proxy: {
			"/api": {
				target: process.env.API_ORIGIN ?? "http://localhost:3000",
				changeOrigin: true,
			},
		},
	},
});
