import { describe, expect, it } from "vitest";

import type { BackfillRecord, KnownEvent } from "../src/domain/backfill.ts";
import {
	planBackfill,
	receivingAt,
	syntheticParticipantUuid,
} from "../src/domain/backfill.ts";
import { msUntilNextKst } from "../src/jobs/daily.ts";
import { encodeMeetingUuid } from "../src/zoom/report-api.ts";

const MEETING = { meetingId: "83877926942", meetingUuid: "S1==", meetingStartedAt: null };
const at = (hhmmss: string) => new Date(`2026-10-22T${hhmmss}Z`);

function record(
	userId: string,
	name: string,
	join: string,
	leave: string | null,
): BackfillRecord {
	return { userId, name, joinTime: at(join), leaveTime: leave ? at(leave) : null };
}

function known(
	participantUuid: string,
	eventType: "joined" | "left",
	time: string,
	userId: string,
	displayName: string,
): KnownEvent {
	return { participantUuid, eventType, occurredAt: at(time), userId, displayName };
}

/** 12:14 ~ 14:31 동안 서버가 아무것도 받지 못했다 */
const RECEIVED = [
	...Array.from({ length: 30 }, (_, i) => at("11:00:00").getTime() + i * 2 * 60_000),
	...Array.from({ length: 30 }, (_, i) => at("14:31:03").getTime() + i * 2 * 60_000),
];

describe("놓친 입퇴장 메꾸기", () => {
	it("이미 받은 이벤트는 넣지 않는다", () => {
		const plan = planBackfill({
			...MEETING,
			records: [record("100", "철수", "11:00:00", "11:30:00")],
			known: [
				known("P1", "joined", "11:00:00", "100", "철수"),
				known("P1", "left", "11:30:00", "100", "철수"),
			],
			receivedAt: RECEIVED,
		});

		expect(plan.events).toEqual([]);
		expect(plan.matched).toBe(2);
	});

	it("공백 전에 들어와 공백 중에 나간 사람은 원래 uuid 로 나간다", () => {
		// 다른 uuid 로 들어가면 원래 행은 영원히 "접속 중" 으로 남는다
		const plan = planBackfill({
			...MEETING,
			records: [record("100", "철수", "11:00:00", "13:00:00")],
			known: [known("P1", "joined", "11:00:00", "100", "철수")],
			receivedAt: RECEIVED,
		});

		expect(plan.events).toHaveLength(1);
		expect(plan.events[0]?.event).toMatchObject({
			participantUuid: "P1",
			eventType: "left",
			occurredAt: at("13:00:00"),
		});
		expect(plan.events[0]?.anchored).toBe(true);
	});

	it("공백 중에 방을 옮겼어도 공백 뒤 웹훅으로 이어 붙인다", () => {
		// 구간 1(공백 중 입장) → 구간 2(공백 중 이동) → 구간 3(공백 뒤 이동, 웹훅 있음)
		const plan = planBackfill({
			...MEETING,
			records: [
				record("200", "영희", "12:30:00", "13:10:00"),
				record("201", "영희", "13:10:00", "14:40:00"),
				record("202", "영희", "14:40:00", "15:00:00"),
			],
			known: [
				known("P2", "left", "14:40:00", "201", "영희"),
				known("P2", "joined", "14:40:00", "202", "영희"),
				known("P2", "left", "15:00:00", "202", "영희"),
			],
			receivedAt: RECEIVED,
		});

		expect(plan.events.map((e) => e.event.participantUuid)).toEqual([
			"P2",
			"P2",
			"P2",
		]);
		expect(plan.events.map((e) => [e.event.eventType, e.event.occurredAt])).toEqual([
			["joined", at("12:30:00")],
			["left", at("13:10:00")],
			["joined", at("13:10:00")],
		]);
	});

	it("공백 안에서 시작하고 끝난 사람은 결정적인 가짜 uuid 를 받는다", () => {
		const records = [
			record("300", "민수", "12:20:00", "12:50:00"),
			record("301", "민수", "12:50:00", "13:20:00"),
		];
		const input = { ...MEETING, records, known: [], receivedAt: RECEIVED };
		const first = planBackfill(input);
		const again = planBackfill(input);

		const uuids = new Set(first.events.map((e) => e.event.participantUuid));
		expect(uuids.size).toBe(1);
		expect([...uuids][0]).toBe(syntheticParticipantUuid("S1==", records[0] as BackfillRecord));
		expect(first.events.every((e) => !e.anchored)).toBe(true);
		expect(again.events).toEqual(first.events);
	});

	it("방 이동이 아닌 재입장은 묶지 않는다", () => {
		const plan = planBackfill({
			...MEETING,
			records: [
				record("400", "지수", "12:20:00", "12:30:00"),
				record("401", "지수", "13:00:00", "13:30:00"),
			],
			known: [],
			receivedAt: RECEIVED,
		});

		const uuids = new Set(plan.events.map((e) => e.event.participantUuid));
		expect(uuids.size).toBe(2);
	});

	it("같은 이름이라도 다른 사람의 구간은 user_id 로 가른다", () => {
		const plan = planBackfill({
			...MEETING,
			records: [record("500", "김", "11:00:00", "13:00:00")],
			known: [
				known("A", "joined", "11:00:00", "500", "김"),
				known("B", "joined", "11:05:00", "510", "김"),
			],
			receivedAt: RECEIVED,
		});

		expect(plan.events[0]?.event.participantUuid).toBe("A");
	});

	it("받고 있던 시각에 대부분 안 맞으면 세션을 통째로 넣지 않는다", () => {
		// 시각 형식이 어긋나는 등 맞추는 규칙이 깨지면 세션 전체가 두 겹이 된다
		const records = Array.from({ length: 10 }, (_, i) =>
			record(String(600 + i), `사람${i}`, "11:00:00", "11:30:00"),
		);
		const plan = planBackfill({
			...MEETING,
			records,
			known: records.map((r, i) => known(`Q${i}`, "joined", "11:00:30", r.userId, r.name ?? "")),
			receivedAt: RECEIVED,
		});

		expect(plan.skipReason).not.toBeNull();
		expect(plan.events).toEqual([]);

		const forced = planBackfill({
			...MEETING,
			records,
			known: [],
			receivedAt: RECEIVED,
			force: true,
		});
		expect(forced.skipReason).toBeNull();
	});

	it("공백 중의 이벤트는 비율 검사에 들어가지 않는다", () => {
		// 2시간 내내 못 받았으니 그 사이 이벤트가 전부 빠진 것은 정상이다
		const records = Array.from({ length: 20 }, (_, i) =>
			record(String(700 + i), `사람${i}`, "12:30:00", "13:30:00"),
		);
		const plan = planBackfill({ ...MEETING, records, known: [], receivedAt: RECEIVED });

		expect(plan.receiving).toBe(0);
		expect(plan.skipReason).toBeNull();
		expect(plan.events).toHaveLength(40);
	});

	it("같은 구간이 두 번 실려 와도 한 번만 넣는다", () => {
		const r = record("800", "중복", "12:30:00", "13:00:00");
		const plan = planBackfill({ ...MEETING, records: [r, { ...r }], known: [], receivedAt: RECEIVED });
		expect(plan.events).toHaveLength(2);
	});

	it("초 단위 반올림 차이는 같은 이벤트로 본다", () => {
		const plan = planBackfill({
			...MEETING,
			records: [record("900", "반올림", "11:00:01", null)],
			known: [known("R", "joined", "11:00:00", "900", "반올림")],
			receivedAt: RECEIVED,
		});
		expect(plan.events).toEqual([]);
	});
});

describe("받고 있던 시각인가", () => {
	it("앞뒤 2분 안에 받은 것이 있으면 받고 있었다", () => {
		expect(receivingAt(RECEIVED, at("11:30:00").getTime())).toBe(true);
		expect(receivingAt(RECEIVED, at("13:00:00").getTime())).toBe(false);
		expect(receivingAt([], at("13:00:00").getTime())).toBe(false);
	});
});

describe("다음 04:30 KST", () => {
	it("오늘 04:30 전이면 오늘, 지났으면 내일", () => {
		// 2026-10-22 03:00 KST
		expect(msUntilNextKst(new Date("2026-10-21T18:00:00Z"), 4, 30)).toBe(90 * 60_000);
		// 2026-10-22 23:30 KST → 다음날 04:30 까지 5시간
		expect(msUntilNextKst(new Date("2026-10-22T14:30:00Z"), 4, 30)).toBe(5 * 3600_000);
	});

	it("딱 그 시각이면 내일로 잡는다", () => {
		expect(msUntilNextKst(new Date("2026-10-21T19:30:00Z"), 4, 30)).toBe(24 * 3600_000);
	});
});

describe("세션 uuid 인코딩", () => {
	it("/ 로 시작하거나 // 를 품으면 두 번 인코딩한다", () => {
		expect(encodeMeetingUuid("tc4PjRZPR/m1oljh8GxZ2A==")).toBe("tc4PjRZPR%2Fm1oljh8GxZ2A%3D%3D");
		expect(encodeMeetingUuid("/abc==")).toBe("%252Fabc%253D%253D");
		expect(encodeMeetingUuid("a//b")).toBe("a%252F%252Fb");
	});
});
