import { defineConfig } from "drizzle-kit";

/**
 * 저장소 루트의 .env 를 읽는다.
 *
 * drizzle-kit 은 CLI 로 직접 실행되므로 서버 코드와 달리
 * 환경변수가 미리 주입되어 있지 않다.
 * 이미 DATABASE_URL 이 설정되어 있으면(배포 환경 등) 그대로 쓴다.
 */
if (!process.env.DATABASE_URL) {
	try {
		process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
	} catch {
		// .env 가 없으면 무시한다. 환경변수로 직접 넘기는 경우가 있다.
	}
}

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
});
