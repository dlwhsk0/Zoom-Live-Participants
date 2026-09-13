import { describe, expect, it } from "vitest";

import {
	mergeReconnections,
	unifyNamesByDevice,
	type ParticipantState,
} from "../src/domain/presence.ts";

const BASE = Date.parse("2026-09-13T09:00:00Z");

function row(
	uuid: string,
	name: string | null,
	minutes: number,
	extra: Partial<ParticipantState> = {},
): ParticipantState {
	return {
		meetingId: "m1",
		meetingUuid: "s1",
		meetingStartedAt: null,
		participantUuid: uuid,
		displayName: name,
		publicIp: "203.0.113.9",
		privateIp: "192.168.0.5",
		statusMessage: null,
		statusUpdatedAt: null,
		joinTimeUncertain: false,
		intervals: [],
		isPresent: false,
		lastEventType: "left",
		firstJoinedAt: new Date(BASE + minutes * 60_000),
		lastOccurredAt: new Date(BASE + minutes * 60_000),
		...extra,
	};
}

describe("unifyNamesByDevice", () => {
	it("같은 기기의 이름을 가장 최근 것으로 맞춘다", () => {
		const out = unifyNamesByDevice([
			row("a", "Kevin", 0),
			row("b", "Techeer", 30),
		]);

		expect(out.map((r) => r.displayName)).toEqual(["Techeer", "Techeer"]);
	});

	it("맞춘 뒤에는 한 사람으로 합쳐진다", () => {
		const merged = mergeReconnections(
			unifyNamesByDevice([row("a", "이용욱", 0), row("b", "이 용욱", 30)]),
		);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.displayName).toBe("이 용욱");
		expect(merged[0]?.connectionCount).toBe(2);
	});

	it("기기가 다르면 건드리지 않는다", () => {
		const out = unifyNamesByDevice([
			row("a", "조하나", 0),
			row("b", "김승조", 30, { privateIp: "192.168.0.7" }),
		]);

		expect(out.map((r) => r.displayName)).toEqual(["조하나", "김승조"]);
	});

	it("공인 IP 가 다르면 건드리지 않는다 — 사설 IP 는 겹칠 수 있다", () => {
		const out = unifyNamesByDevice([
			row("a", "조하나", 0),
			row("b", "김승조", 30, { publicIp: "203.0.113.10" }),
		]);

		expect(out.map((r) => r.displayName)).toEqual(["조하나", "김승조"]);
	});

	it("사설 IP 를 모르는 행은 건드리지 않는다 — 기기를 알 수 없다", () => {
		// 아직 한 번도 안 나간 사람이다. 남의 이름을 씌우면 안 된다.
		const out = unifyNamesByDevice([
			row("a", "Kevin", 0),
			row("b", "누구세요", 30, { privateIp: null }),
		]);

		expect(out.map((r) => r.displayName)).toEqual(["Kevin", "누구세요"]);
	});

	it("어드민이 손으로 고친 행은 그대로 둔다 — 떼어내기를 무력화하면 안 된다", () => {
		const out = unifyNamesByDevice(
			[row("a", "이도경", 0), row("b", "다른사람", 30)],
			new Set(["b"]),
		);

		expect(out.map((r) => r.displayName)).toEqual(["이도경", "다른사람"]);
	});

	it("손으로 고친 이름은 대표 이름 후보에서도 빠진다", () => {
		// b 가 가장 최근이지만 손으로 고친 것이므로 a 의 이름이 대표가 된다
		const out = unifyNamesByDevice(
			[row("a", "이도경", 0), row("c", "Chloe", 10), row("b", "떼어낸사람", 30)],
			new Set(["b"]),
		);

		expect(out.map((r) => r.displayName)).toEqual([
			"Chloe",
			"Chloe",
			"떼어낸사람",
		]);
	});

	it("이름이 없는 행은 대표가 되지 않는다", () => {
		const out = unifyNamesByDevice([row("a", "조하나", 0), row("b", null, 30)]);

		expect(out.map((r) => r.displayName)).toEqual(["조하나", "조하나"]);
	});
});
