import { describe, expect, it } from "vitest";

import { parseNameList } from "../src/config/env.ts";

describe("parseNameList", () => {
	it("쉼표로 나눠 공백을 떼어낸다", () => {
		expect(parseNameList("봇A, 봇B ,봇C")).toEqual(["봇A", "봇B", "봇C"]);
	});

	it("비우면 빈 목록이다 — 아무도 봇으로 보지 않는다", () => {
		expect(parseNameList("")).toEqual([]);
		expect(parseNameList("   ")).toEqual([]);
	});

	it("이름 안의 괄호와 슬래시를 건드리지 않는다", () => {
		// 오리진과 달리 끝의 슬래시도 이름의 일부다
		expect(parseNameList("Techeer-up(Test), 출석봇/2")).toEqual([
			"Techeer-up(Test)",
			"출석봇/2",
		]);
	});
});
