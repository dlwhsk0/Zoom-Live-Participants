import { eq, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { users } from "../db/schema.ts";

type Db = ReturnType<typeof getDb>;

export interface UserRow {
	id: string;
	username: string;
	passwordHash: string;
	role: string;
}

/** 아이디로 찾는다. 대소문자는 구분하지 않는다 — 저장도 소문자로 한다. */
export async function findUserByUsername(
	db: Db,
	username: string,
): Promise<UserRow | null> {
	const [row] = await db
		.select({
			id: users.id,
			username: users.username,
			passwordHash: users.passwordHash,
			role: users.role,
		})
		.from(users)
		.where(eq(users.username, username.trim().toLowerCase()))
		.limit(1);

	return row ?? null;
}

export async function touchLastLogin(db: Db, id: string): Promise<void> {
	await db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, id));
}

/** 비밀번호 바꾸기. 이것도 스크립트로만 부른다. */
export async function setPassword(
	db: Db,
	username: string,
	passwordHash: string,
): Promise<boolean> {
	const rows = await db
		.update(users)
		.set({ passwordHash })
		.where(eq(users.username, username.trim().toLowerCase()))
		.returning({ id: users.id });

	return rows.length > 0;
}

/** 계정 만들기. 화면에 가입이 없으므로 스크립트로만 부른다. */
export async function createUser(
	db: Db,
	input: { username: string; passwordHash: string; role: string },
): Promise<UserRow> {
	const [row] = await db
		.insert(users)
		.values({
			username: input.username.trim().toLowerCase(),
			passwordHash: input.passwordHash,
			role: input.role,
		})
		.returning({
			id: users.id,
			username: users.username,
			passwordHash: users.passwordHash,
			role: users.role,
		});

	if (!row) throw new Error("계정을 만들지 못했습니다");
	return row;
}
