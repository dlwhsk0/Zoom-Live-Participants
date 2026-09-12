import { asc, eq } from "drizzle-orm";

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
