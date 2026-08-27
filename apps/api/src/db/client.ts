import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getEnv } from "../config/env.ts";
import * as schema from "./schema.ts";

/**
 * DB 연결.
 *
 * 서버리스에서 두 가지를 지켜야 한다.
 *
 * 1. 모듈 스코프에서 1회만 만든다.
 *    핸들러 안에서 매번 만들면 함수 인스턴스마다 커넥션이 쌓여 고갈된다.
 * 2. prepare: false.
 *    풀러의 transaction mode 는 prepared statement 를 지원하지 않는다.
 */
let client: ReturnType<typeof postgres> | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
	if (database) return database;

	client = postgres(getEnv().DATABASE_URL, {
		max: 1,
		prepare: false,
		idle_timeout: 20,
	});
	database = drizzle(client, { schema });

	return database;
}

/** 테스트/스크립트에서 연결을 명시적으로 닫을 때 쓴다. */
export async function closeDb(): Promise<void> {
	await client?.end({ timeout: 5 });
	client = null;
	database = null;
}
