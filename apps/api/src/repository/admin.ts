import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { getDb } from "../db/client.ts";
import { adminActions, participants } from "../db/schema.ts";

import { findCurrentSession } from "./query.ts";

type Db = ReturnType<typeof getDb>;

export interface Identity {
	participantUuid: string;
	displayName: string | null;
	publicIp: string | null;
	isPresent: boolean;
	firstJoinedAt: Date | null;
	lastOccurredAt: Date;
}

/**
 * 현재 세션의 참가자 행을 손대지 않은 그대로 보여준다.
 *
 * 화면의 목록은 재접속을 합친 결과라 어느 행을 고쳐야 할지 알 수 없다.
 * 어드민은 합치기 전의 원본 행을 봐야 한다.
 */
export async function listIdentities(
	db: Db,
	meetingId: string,
): Promise<{ meetingUuid: string | null; identities: Identity[] }> {
	const session = await findCurrentSession(db, meetingId);
	if (!session) return { meetingUuid: null, identities: [] };

	const rows = await db
		.select({
			participantUuid: participants.participantUuid,
			displayName: participants.displayName,
			publicIp: participants.publicIp,
			isPresent: participants.isPresent,
			firstJoinedAt: participants.firstJoinedAt,
			lastOccurredAt: participants.lastOccurredAt,
		})
		.from(participants)
		.where(eq(participants.meetingUuid, session.meetingUuid))
		.orderBy(desc(participants.lastOccurredAt));

	return { meetingUuid: session.meetingUuid, identities: rows };
}

export interface RenameResult {
	changed: number;
	before: { participantUuid: string; displayName: string | null }[];
}

/**
 * 고른 행들의 표시 이름을 하나로 맞춘다.
 *
 * 이것이 사람을 합치는 방법이자 떼어내는 방법이다. 병합은 이름으로만
 * 판단하므로(presence.ts identityKey 참고), 이름을 같게 하면 합쳐지고
 * 다르게 하면 떨어진다. 규칙을 하나만 두기 위해 이렇게 했다.
 *
 * 이름→이름 별칭 테이블을 두지 않은 이유가 있다. 여러 사람이 서로
 * 이름을 바꾸면 별칭이 뒤엉킨다. 행을 직접 고치면 신원이 특정
 * participant_uuid 에 붙으므로 그런 일이 없다.
 *
 * participant_events 와 webhook_events 는 건드리지 않는다. Zoom 이
 * 실제로 보낸 것이 무엇인지는 그대로 남아야 한다. 되돌릴 수 있는 것도
 * 그 덕분이다.
 */
export async function renameParticipants(
	db: Db,
	input: {
		meetingUuid: string;
		participantUuids: string[];
		displayName: string;
		clientIp: string | null;
	},
): Promise<RenameResult> {
	if (input.participantUuids.length === 0) {
		return { changed: 0, before: [] };
	}

	return db.transaction(async (tx) => {
		const targets = await tx
			.select({
				participantUuid: participants.participantUuid,
				displayName: participants.displayName,
			})
			.from(participants)
			.where(
				and(
					eq(participants.meetingUuid, input.meetingUuid),
					inArray(participants.participantUuid, input.participantUuids),
				),
			);

		if (targets.length === 0) return { changed: 0, before: [] };

		await tx
			.update(participants)
			.set({ displayName: input.displayName, updatedAt: sql`now()` })
			.where(
				and(
					eq(participants.meetingUuid, input.meetingUuid),
					inArray(
						participants.participantUuid,
						targets.map((t) => t.participantUuid),
					),
				),
			);

		await tx.insert(adminActions).values({
			action: "rename",
			meetingUuid: input.meetingUuid,
			detail: {
				targets: targets.map((t) => ({
					participantUuid: t.participantUuid,
					before: t.displayName,
				})),
				after: input.displayName,
			},
			clientIp: input.clientIp,
		});

		return { changed: targets.length, before: targets };
	});
}

export interface AdminAction {
	id: string;
	createdAt: Date;
	action: string;
	meetingUuid: string | null;
	detail: unknown;
	clientIp: string | null;
}

export async function listAdminActions(
	db: Db,
	limit: number,
): Promise<AdminAction[]> {
	return db
		.select({
			id: adminActions.id,
			createdAt: adminActions.createdAt,
			action: adminActions.action,
			meetingUuid: adminActions.meetingUuid,
			detail: adminActions.detail,
			clientIp: adminActions.clientIp,
		})
		.from(adminActions)
		.orderBy(desc(adminActions.createdAt))
		.limit(Math.min(Math.max(limit, 1), 200));
}

/**
 * 한 번의 rename 을 되돌린다. 되돌린 것도 기록에 남는다.
 */
export async function undoAction(
	db: Db,
	actionId: string,
	clientIp: string | null,
): Promise<{ ok: boolean; reason?: string; restored: number }> {
	return db.transaction(async (tx) => {
		const [action] = await tx
			.select()
			.from(adminActions)
			.where(eq(adminActions.id, actionId))
			.limit(1);

		if (!action) return { ok: false, reason: "없는 기록입니다", restored: 0 };
		if (action.action !== "rename") {
			return { ok: false, reason: "되돌릴 수 없는 기록입니다", restored: 0 };
		}

		const detail = action.detail as {
			targets?: { participantUuid: string; before: string | null }[];
		};
		const targets = detail.targets ?? [];
		if (targets.length === 0 || !action.meetingUuid) {
			return { ok: false, reason: "되돌릴 내용이 없습니다", restored: 0 };
		}

		for (const target of targets) {
			await tx
				.update(participants)
				.set({ displayName: target.before, updatedAt: sql`now()` })
				.where(
					and(
						eq(participants.meetingUuid, action.meetingUuid),
						eq(participants.participantUuid, target.participantUuid),
					),
				);
		}

		await tx.insert(adminActions).values({
			action: "undo",
			meetingUuid: action.meetingUuid,
			detail: { undid: actionId, restored: targets },
			clientIp,
		});

		return { ok: true, restored: targets.length };
	});
}
