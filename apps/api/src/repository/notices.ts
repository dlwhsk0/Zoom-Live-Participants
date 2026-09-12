import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { notices } from "../db/schema.ts";

type Db = ReturnType<typeof getDb>;

/** `main` 은 지금 가장 알려야 하는 것, `general` 은 꿀팁류다. */
export type NoticeCategory = "main" | "general";

/** 화면 말풍선에 도는 공지 한 줄. */
export interface Notice {
	id: string;
	body: string;
	category: NoticeCategory;
}

/** 아는 값만 받아들인다. 이상한 값은 general 로 떨어뜨린다. */
export function toCategory(value: unknown): NoticeCategory {
	return value === "main" ? "main" : "general";
}

/**
 * 지금 띄울 공지를 순서대로 읽는다.
 *
 * 빼는 것 셋: 내린 것(`is_active = false`), 아직 시작 전인 것, 이미 끝난 것.
 * 시작·종료가 비어 있으면 그 방향으로는 제한이 없다는 뜻이다.
 *
 * 기간 판정을 DB 에서 하는 이유는 시계가 하나여야 하기 때문이다. 화면 시계로
 * 자르면 사람마다 다른 것을 보게 된다.
 *
 * 몇 줄짜리라 통째로 읽는다 — 별칭표와 같은 이유다.
 */
export async function listActiveNotices(db: Db): Promise<Notice[]> {
	const now = new Date();

	const rows = await db
		.select({ id: notices.id, body: notices.body, category: notices.category })
		.from(notices)
		.where(
			and(
				eq(notices.isActive, true),
				or(isNull(notices.startsAt), lte(notices.startsAt, now)),
				or(isNull(notices.endsAt), gt(notices.endsAt, now)),
			),
		)
		.orderBy(asc(notices.sortOrder), asc(notices.createdAt));

	return rows.map((row) => ({ ...row, category: toCategory(row.category) }));
}

/** 어드민이 보는 공지. 내린 것도 포함하고 편집에 필요한 값이 다 들어 있다. */
export interface AdminNotice extends Notice {
	sortOrder: number;
	isActive: boolean;
	/** 비어 있으면 곧바로 뜬다. */
	startsAt: Date | null;
	/** 비어 있으면 내릴 때까지 계속 뜬다. */
	endsAt: Date | null;
	updatedAt: Date;
}

const ADMIN_COLUMNS = {
	id: notices.id,
	body: notices.body,
	category: notices.category,
	sortOrder: notices.sortOrder,
	isActive: notices.isActive,
	startsAt: notices.startsAt,
	endsAt: notices.endsAt,
	updatedAt: notices.updatedAt,
} as const;

/** 내린 것까지 전부 읽는다. 어드민 화면 전용이다. */
export async function listAllNotices(db: Db): Promise<AdminNotice[]> {
	const rows = await db
		.select(ADMIN_COLUMNS)
		.from(notices)
		.orderBy(asc(notices.sortOrder), asc(notices.createdAt));

	return rows.map((row) => ({ ...row, category: toCategory(row.category) }));
}

/**
 * 공지를 새로 만든다.
 *
 * 정렬값을 주지 않으면 맨 뒤에 붙인다 — 새 공지가 기존 순서를 흔들지 않도록.
 */
export async function createNotice(
	db: Db,
	input: {
		body: string;
		category?: NoticeCategory;
		startsAt?: Date | null;
		endsAt?: Date | null;
		sortOrder?: number;
	},
): Promise<AdminNotice> {
	const order =
		input.sortOrder ??
		((
			await db
				.select({ max: sql<number | null>`max(${notices.sortOrder})` })
				.from(notices)
		)[0]?.max ?? -1) + 1;

	const rows = await db
		.insert(notices)
		.values({
			body: input.body,
			category: input.category ?? "general",
			startsAt: input.startsAt ?? null,
			endsAt: input.endsAt ?? null,
			sortOrder: order,
		})
		.returning(ADMIN_COLUMNS);

	const row = rows[0];
	if (!row) throw new Error("공지를 만들지 못했습니다");
	return { ...row, category: toCategory(row.category) };
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
	patch: {
		body?: string;
		category?: NoticeCategory;
		sortOrder?: number;
		isActive?: boolean;
		/** null 을 주면 제한을 없앤다. undefined 는 그대로 둔다. */
		startsAt?: Date | null;
		endsAt?: Date | null;
	},
): Promise<AdminNotice | null> {
	const values: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.body !== undefined) values.body = patch.body;
	if (patch.category !== undefined) values.category = patch.category;
	if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
	if (patch.isActive !== undefined) values.isActive = patch.isActive;
	if (patch.startsAt !== undefined) values.startsAt = patch.startsAt;
	if (patch.endsAt !== undefined) values.endsAt = patch.endsAt;

	const rows = await db
		.update(notices)
		.set(values)
		.where(eq(notices.id, id))
		.returning(ADMIN_COLUMNS);

	const row = rows[0];
	return row ? { ...row, category: toCategory(row.category) } : null;
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
