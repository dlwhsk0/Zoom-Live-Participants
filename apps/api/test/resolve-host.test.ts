import { describe, expect, it } from "vitest";

import { resolveHost } from "../src/repository/query.ts";

const NO_ALIAS = new Map<string, string>();

function person(displayName: string, isPresent = true) {
	return { displayName, isPresent };
}

describe("resolveHost", () => {
	it("역할 이벤트가 지목한 사람이 아직 있으면 그 사람이다", () => {
		const host = resolveHost(
			{ displayName: "이정", at: new Date("2026-09-12T10:00:00Z") },
			[person("김승조"), person("이정")],
			"김승조",
			NO_ALIAS,
		);

		expect(host).toEqual({
			displayName: "이정",
			since: new Date("2026-09-12T10:00:00Z"),
			isPresent: true,
			source: "role_event",
		});
	});

	it("호스트가 나갔고 남은 사람이 하나면 그 사람이다", () => {
		const host = resolveHost(
			{ displayName: "이정", at: null },
			[person("이정", false), person("조하나")],
			null,
			NO_ALIAS,
		);

		expect(host?.displayName).toBe("조하나");
		expect(host?.source).toBe("only_one_left");
	});

	it("호스트가 나갔고 여럿이 남았으면 모른다 — 아무나 지목하지 않는다", () => {
		const host = resolveHost(
			{ displayName: "이정", at: null },
			[person("이정", false), person("조하나"), person("김승조")],
			"김승조",
			NO_ALIAS,
		);

		expect(host).toBeNull();
	});

	it("역할 이벤트가 없으면 문 연 사람으로 물러서되 추정이라고 밝힌다", () => {
		const host = resolveHost(null, [person("김승조"), person("조하나")], "김승조", NO_ALIAS);

		expect(host?.displayName).toBe("김승조");
		expect(host?.source).toBe("opener");
	});

	it("문 연 사람도 나갔으면 모른다", () => {
		const host = resolveHost(null, [person("김승조", false), person("조하나")], "김승조", NO_ALIAS);

		expect(host).toBeNull();
	});

	it("역할 이벤트도 문 연 사람도 없으면 모른다", () => {
		expect(resolveHost(null, [person("조하나")], null, NO_ALIAS)).toBeNull();
	});

	it("별칭을 거쳐 대표 이름으로 맞춘다", () => {
		// 역할 이벤트의 이름은 Zoom 표시 이름이라 별칭 그대로 올 수 있다
		const host = resolveHost(
			{ displayName: "Chloe", at: null },
			[person("이도경")],
			null,
			new Map([["Chloe", "이도경"]]),
		);

		expect(host?.displayName).toBe("이도경");
		expect(host?.source).toBe("role_event");
	});
});
