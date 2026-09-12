import { asc, eq, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { notices } from "../db/schema.ts";

type Db = ReturnType<typeof getDb>;

/** 화면 말풍선에 도는 공지 한 줄. */
export interface Notice {
	id: string;
	body: string;
}

/**
 * 지금 띄울 공지를 순서대로 읽는다.
 *
 * 내린 것(`is_active = false`)은 빼고, 정렬값이 같으면 만든 순서다.
 * 몇 줄짜리라 통째로 읽는다 — 별칭표와 같은 이유다.
 */
export async function listActiveNotices(db: Db): Promise<Notice[]> {
	const rows = await db
		.select({ id: notices.id, body: notices.body })
		.from(notices)
		.where(eq(notices.isActive, true))
		.orderBy(asc(notices.sortOrder), asc(notices.createdAt));

	return rows;
}

/** 어드민이 보는 공지. 내린 것도 포함하고 편집에 필요한 값이 다 들어 있다. */
export interface AdminNotice extends Notice {
	sortOrder: number;
	isActive: boolean;
	updatedAt: Date;
}

/** 내린 것까지 전부 읽는다. 어드민 화면 전용이다. */
export async function listAllNotices(db: Db): Promise<AdminNotice[]> {
	return db
		.select({
			id: notices.id,
			body: notices.body,
			sortOrder: notices.sortOrder,
			isActive: notices.isActive,
			updatedAt: notices.updatedAt,
		})
		.from(notices)
		.orderBy(asc(notices.sortOrder), asc(notices.createdAt));
}

/**
 * 공지를 새로 만든다.
 *
 * 정렬값을 주지 않으면 맨 뒤에 붙인다 — 새 공지가 기존 순서를 흔들지 않도록.
 */
export async function createNotice(
	db: Db,
	body: string,
	sortOrder?: number,
): Promise<AdminNotice> {
	const order =
		sortOrder ??
		((
			await db
				.select({ max: sql<number | null>`max(${notices.sortOrder})` })
				.from(notices)
		)[0]?.max ?? -1) + 1;

	const rows = await db
		.insert(notices)
		.values({ body, sortOrder: order })
		.returning({
			id: notices.id,
			body: notices.body,
			sortOrder: notices.sortOrder,
			isActive: notices.isActive,
			updatedAt: notices.updatedAt,
		});

	const row = rows[0];
	if (!row) throw new Error("공지를 만들지 못했습니다");
	return row;
}

/**
 * 공지를 고친다. 준 값만 바꾼다.
 *
 * 지우는 대신 `isActive` 를 내리는 것이 기본이다 — 되살릴 일이 잦고,
 * 지워 버리면 무엇을 왜 내렸는지가 남지 않는다.
 */
export async function updateNotice(
	db: Db,
	id: string,
	patch: { body?: string; sortOrder?: number; isActive?: boolean },
): Promise<AdminNotice | null> {
	const values: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.body !== undefined) values.body = patch.body;
	if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
	if (patch.isActive !== undefined) values.isActive = patch.isActive;

	const rows = await db
		.update(notices)
		.set(values)
		.where(eq(notices.id, id))
		.returning({
			id: notices.id,
			body: notices.body,
			sortOrder: notices.sortOrder,
			isActive: notices.isActive,
			updatedAt: notices.updatedAt,
		});

	return rows[0] ?? null;
}

/**
 * 공지를 지운다.
 *
 * 평소에는 내리는 것(`isActive=false`)으로 충분하다. 이건 잘못 만든 줄을
 * 치울 때만 쓴다.
 */
export async function deleteNotice(db: Db, id: string): Promise<boolean> {
	const rows = await db
		.delete(notices)
		.where(eq(notices.id, id))
		.returning({ id: notices.id });

	return rows.length > 0;
}
