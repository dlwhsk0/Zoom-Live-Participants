import { describe, expect, it, vi } from "vitest";

import type { PresenceSnapshot, SessionParticipant } from "../src/api.ts";

/**
 * VITE_BOT_NAMES 는 모듈을 처음 읽을 때 한 번 잡힌다.
 * 값을 먼저 넣고 나서 모듈을 가져와야 한다.
 */
async function load(names: string) {
	vi.resetModules();
	vi.stubEnv("VITE_BOT_NAMES", names);
	return (await import("../src/api.ts")).stripBots;
}

function person(
	name: string,
	isPresent: boolean,
): SessionParticipant {
	return {
		participantUuid: `u-${name}`,
		displayName: name,
		firstJoinedAt: "2026-09-12T10:00:00Z",
		isPresent,
		lastOccurredAt: "2026-09-12T10:00:00Z",
		connectionCount: 1,
		onlineSeconds: 60,
		statusMessage: null,
		joinTimeUncertain: false,
		isYou: false,
	};
}

function snapshot(people: SessionParticipant[]): PresenceSnapshot {
	return {
		meetingId: "10000000001",
		meetingUuid: "TESTUUID0001==",
		count: people.filter((p) => p.isPresent).length,
		totalCount: people.length,
		startedAt: "2026-09-12T09:00:00Z",
		startedAtEstimated: false,
		openedBy: people[0]?.displayName ?? null,
		updatedAt: "2026-09-12T10:00:00Z",
		participants: people,
		bot: null,
	};
}

describe("stripBots", () => {
	it("봇을 목록에서 빼고 인원수도 같이 줄인다", async () => {
		const stripBots = await load("봇");
		const out = stripBots(snapshot([person("조하나", true), person("봇", true)]));

		expect(out.participants.map((p) => p.displayName)).toEqual(["조하나"]);
		expect(out.count).toBe(1);
		expect(out.totalCount).toBe(1);
	});

	it("봇이 붙어 있으면 bot 으로 알린다", async () => {
		const stripBots = await load("봇");
		const out = stripBots(snapshot([person("조하나", true), person("봇", true)]));

		expect(out.bot).toEqual({
			name: "봇",
			isPresent: true,
			since: "2026-09-12T10:00:00Z",
		});
	});

	it("봇이 나갔으면 구동 중이 아니다", async () => {
		const stripBots = await load("봇");
		const out = stripBots(snapshot([person("조하나", true), person("봇", false)]));

		expect(out.bot?.isPresent).toBe(false);
		expect(out.count).toBe(1);
	});

	it("첫 입장이 봇이면 문 연 사람을 모르는 것으로 둔다", async () => {
		const stripBots = await load("봇");
		const out = stripBots(snapshot([person("봇", true), person("조하나", true)]));

		expect(out.openedBy).toBeNull();
	});

	it("이름을 안 넣으면 아무도 걸러내지 않는다", async () => {
		const stripBots = await load("");
		const input = snapshot([person("조하나", true), person("봇", true)]);

		expect(stripBots(input)).toBe(input);
	});

	it("서버가 이미 빼고 줬으면 그대로 둔다", async () => {
		const stripBots = await load("봇");
		const input = snapshot([person("조하나", true)]);

		expect(stripBots(input)).toBe(input);
	});
});
