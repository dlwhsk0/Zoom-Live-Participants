import { describe, expect, it } from "vitest";

import { credentialsAccepted } from "../../../middleware.ts";

/** 브라우저가 보내는 것과 같은 모양으로 만든다. */
function basic(user: string, password: string): string {
	return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

const PASSWORD = "techeer-test-pw";

describe("사이트 공용 비밀번호", () => {
	it("아이디를 비우고 비밀번호만 맞으면 통과한다", () => {
		expect(credentialsAccepted(basic("", PASSWORD), { password: PASSWORD })).toBe(true);
	});

	it("아이디에 아무 값이나 넣으면 막는다 — 규칙이 하나여야 공지도 한 줄이다", () => {
		expect(credentialsAccepted(basic("아무거나", PASSWORD), { password: PASSWORD })).toBe(false);
		expect(credentialsAccepted(basic("techeer", PASSWORD), { password: PASSWORD })).toBe(false);
		expect(credentialsAccepted(basic(" ", PASSWORD), { password: PASSWORD })).toBe(false);
	});

	it("비밀번호가 틀리면 아이디가 무엇이든 막는다", () => {
		expect(credentialsAccepted(basic("techeer", "틀린비번"), { password: PASSWORD })).toBe(false);
	});

	it("헤더가 없거나 형식이 다르면 막는다", () => {
		expect(credentialsAccepted(null, { password: PASSWORD })).toBe(false);
		expect(credentialsAccepted("Bearer abc", { password: PASSWORD })).toBe(false);
		expect(credentialsAccepted("Basic !!!not-base64!!!", { password: PASSWORD })).toBe(false);
		expect(credentialsAccepted("Basic " + Buffer.from("콜론없음").toString("base64"), { password: PASSWORD })).toBe(false);
	});

	it("비밀번호에 콜론이 있어도 다룬다", () => {
		const withColon = "a:b:c";
		expect(credentialsAccepted(basic("", withColon), { password: withColon })).toBe(true);
	});

	it("비밀번호가 틀리면 아이디를 비워도 막는다", () => {
		expect(credentialsAccepted(basic("", "틀린비번"), { password: PASSWORD })).toBe(false);
	});

	it("아이디를 지정하면 그때는 아이디도 본다", () => {
		const expected = { user: "techeer", password: PASSWORD };
		expect(credentialsAccepted(basic("techeer", PASSWORD), expected)).toBe(true);
		expect(credentialsAccepted(basic("남", PASSWORD), expected)).toBe(false);
	});
});
