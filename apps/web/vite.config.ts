/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	test: {
		// 회의 시작 시각은 보는 사람의 시간대로 표시된다.
		// 테스트가 도는 기계의 시간대에 따라 결과가 달라지지 않게 고정한다.
		env: { TZ: "Asia/Seoul" },
	},
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
