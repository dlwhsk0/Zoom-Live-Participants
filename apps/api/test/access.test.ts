import { describe, expect, it } from "vitest";

import { accessAllowed } from "../src/http/access.ts";

const TOKEN = "공유토큰";

describe("공유 토큰", () => {
	it("설정하지 않으면 검사하지 않는다 — 배포만으로 화면이 죽으면 안 된다", () => {
		expect(accessAllowed("", {})).toBe(true);
		expect(accessAllowed("", { "x-access-token": "아무거나" })).toBe(true);
	});

	it("헤더로 맞는 값을 주면 통과", () => {
		expect(accessAllowed(TOKEN, { "x-access-token": TOKEN })).toBe(true);
	});

	it("Bearer 로 줘도 통과", () => {
		expect(accessAllowed(TOKEN, { authorization: `Bearer ${TOKEN}` })).toBe(true);
	});

	it("없거나 틀리면 막는다", () => {
		expect(accessAllowed(TOKEN, {})).toBe(false);
		expect(accessAllowed(TOKEN, { "x-access-token": "틀린값" })).toBe(false);
		expect(accessAllowed(TOKEN, { "x-access-token": "" })).toBe(false);
	});

	it("헤더가 배열로 와도 다룬다", () => {
		expect(accessAllowed(TOKEN, { "x-access-token": [TOKEN] })).toBe(true);
	});
});
