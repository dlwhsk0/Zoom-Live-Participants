import { describe, expect, it } from "vitest";

import {
	mergeReconnections,
	type ParticipantState,
	sortForDisplay,
} from "../src/domain/presence.ts";
import { shuffle } from "./fixture.ts";

const BASE = Date.parse("2026-08-30T09:00:00Z");

/** 분 단위 오프셋으로 상태 행을 만든다. */
function row(
	overrides: Partial<ParticipantState> & {
		uuid: string;
		joinedMin: number | null;
		lastMin: number;
	},
): ParticipantState {
	const { uuid, joinedMin, lastMin, ...rest } = overrides;
	return {
		meetingId: "m1",
		meetingUuid: "s1",
		participantUuid: uuid,
		displayName: "조하나",
		publicIp: "203.0.113.1",
		statusMessage: null,
		statusUpdatedAt: null,
		isPresent: false,
		lastEventType: "left",
		firstJoinedAt: joinedMin === null ? null : new Date(BASE + joinedMin * 60_000),
		lastOccurredAt: new Date(BASE + lastMin * 60_000),
		...rest,
	};
}

describe("mergeReconnections", () => {
	it("시간이 겹치지 않는 재접속을 한 사람으로 합친다", () => {
		// 실제 관측 사례: 조하나가 09:06 에 나갔다가 09:15 에 다시 들어옴
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6 }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.connectionCount).toBe(2);
		expect(merged[0]?.isPresent).toBe(true);
	});

	it("합친 뒤 최초 입장 시각이 이어진다 — 경과 시간이 리셋되지 않는다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6 }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged[0]?.firstJoinedAt?.getTime()).toBe(BASE);
	});

	it("시간이 겹치면 합치지 않는다 — 같은 NAT 뒤의 동명이인", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 20, isPresent: true, lastEventType: "joined" }),
			row({ uuid: "B", joinedMin: 5, lastMin: 22, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(2);
	});

	it("앞 사람이 아직 접속 중이면 합치지 않는다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 3, isPresent: true, lastEventType: "joined" }),
			row({ uuid: "B", joinedMin: 10, lastMin: 10, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(2);
	});

	it("이름이 같아도 IP 가 다르면 합치지 않는다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6 }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, publicIp: "203.0.113.2" }),
		]);

		expect(merged).toHaveLength(2);
	});

	it("IP 가 같아도 이름이 다르면 합치지 않는다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6 }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, displayName: "김동현" }),
		]);

		expect(merged).toHaveLength(2);
	});

	it("public_ip 가 없으면 합치지 않는다 — 보수적으로 처리", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6, publicIp: null }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, publicIp: null }),
		]);

		expect(merged).toHaveLength(2);
	});

	it("표시 이름이 없으면 합치지 않는다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6, displayName: null }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, displayName: null }),
		]);

		expect(merged).toHaveLength(2);
	});

	it("세 번 이상 재접속해도 하나로 합쳐진다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 5 }),
			row({ uuid: "B", joinedMin: 10, lastMin: 15 }),
			row({ uuid: "C", joinedMin: 20, lastMin: 20, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.connectionCount).toBe(3);
		expect(merged[0]?.firstJoinedAt?.getTime()).toBe(BASE);
		expect(merged[0]?.isPresent).toBe(true);
	});

	it("합칠 때 이름은 마지막 것으로 갱신된다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6, displayName: "조하나" }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, displayName: "조하나" }),
		]);

		expect(merged[0]?.displayName).toBe("조하나");
		// 대표 uuid 는 최근 접속 쪽
		expect(merged[0]?.participantUuid).toBe("B");
	});

	it("이름을 바꾼 채 재접속하면 합쳐지지 않는다 — 알려진 한계", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6, displayName: "조하나" }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, displayName: "하나" }),
		]);

		expect(merged).toHaveLength(2);
	});

	it("나가자마자 바로 재접속해도 합쳐진다 — 경계값", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6 }),
			row({ uuid: "B", joinedMin: 6, lastMin: 6, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(1);
	});

	it("서로 다른 사람은 각각 남는다", () => {
		const merged = mergeReconnections([
			row({ uuid: "A", joinedMin: 0, lastMin: 6, displayName: "조하나" }),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, displayName: "조하나" }),
			row({ uuid: "C", joinedMin: 3, lastMin: 20, displayName: "김동현", publicIp: "203.0.113.9", isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(2);
		expect(merged.map((m) => m.displayName).sort()).toEqual(["김동현", "조하나"]);
	});

	it("입력 순서를 바꿔도 결과가 같다", () => {
		const rows = [
			row({ uuid: "A", joinedMin: 0, lastMin: 5 }),
			row({ uuid: "B", joinedMin: 10, lastMin: 15 }),
			row({ uuid: "C", joinedMin: 20, lastMin: 20, isPresent: true, lastEventType: "joined" }),
			row({ uuid: "D", joinedMin: 2, lastMin: 30, displayName: "김동현", publicIp: "203.0.113.9", isPresent: true, lastEventType: "joined" }),
		];

		const expected = JSON.stringify(
			sortForDisplay(mergeReconnections(rows)).map((m) => [
				m.displayName,
				m.connectionCount,
				m.isPresent,
				m.firstJoinedAt?.getTime(),
			]),
		);

		for (let seed = 1; seed <= 100; seed++) {
			const actual = JSON.stringify(
				sortForDisplay(mergeReconnections(shuffle(rows, seed))).map((m) => [
					m.displayName,
					m.connectionCount,
					m.isPresent,
					m.firstJoinedAt?.getTime(),
				]),
			);
			expect(actual).toBe(expected);
		}
	});

	it("빈 입력은 빈 결과", () => {
		expect(mergeReconnections([])).toEqual([]);
	});
});

describe("sortForDisplay", () => {
	it("접속 중인 사람이 앞에 온다", () => {
		const sorted = sortForDisplay(
			mergeReconnections([
				row({ uuid: "A", joinedMin: 0, lastMin: 6, displayName: "나간사람" }),
				row({
					uuid: "B",
					joinedMin: 10,
					lastMin: 10,
					displayName: "접속중",
					publicIp: "203.0.113.9",
					isPresent: true,
					lastEventType: "joined",
				}),
			]),
		);

		expect(sorted.map((s) => s.displayName)).toEqual(["접속중", "나간사람"]);
	});
});

describe("상태 메시지 승계", () => {
	it("재접속해도 이전 접속의 상태 메시지가 이어진다", () => {
		const merged = mergeReconnections([
			row({
				uuid: "A",
				joinedMin: 0,
				lastMin: 6,
				statusMessage: "자리 비움",
				statusUpdatedAt: new Date(BASE + 3 * 60_000),
			}),
			row({ uuid: "B", joinedMin: 15, lastMin: 15, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.statusMessage).toBe("자리 비움");
	});

	it("나중에 적은 상태 메시지가 이긴다", () => {
		const merged = mergeReconnections([
			row({
				uuid: "A",
				joinedMin: 0,
				lastMin: 6,
				statusMessage: "예전 메시지",
				statusUpdatedAt: new Date(BASE + 1 * 60_000),
			}),
			row({
				uuid: "B",
				joinedMin: 15,
				lastMin: 15,
				isPresent: true,
				lastEventType: "joined",
				statusMessage: "새 메시지",
				statusUpdatedAt: new Date(BASE + 16 * 60_000),
			}),
		]);

		expect(merged[0]?.statusMessage).toBe("새 메시지");
	});

	it("합쳐지지 않는 사람끼리는 상태가 섞이지 않는다", () => {
		const merged = mergeReconnections([
			row({
				uuid: "A",
				joinedMin: 0,
				lastMin: 20,
				isPresent: true,
				lastEventType: "joined",
				statusMessage: "A 의 상태",
				statusUpdatedAt: new Date(BASE),
			}),
			row({ uuid: "B", joinedMin: 5, lastMin: 22, isPresent: true, lastEventType: "joined" }),
		]);

		expect(merged).toHaveLength(2);
		expect(merged.find((m) => m.participantUuid === "B")?.statusMessage).toBeNull();
	});
});
