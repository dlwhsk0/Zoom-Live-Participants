import { describe, expect, it } from "vitest";

import {
	buildSessionCookie,
	cookieFrom,
	createSessionValue,
	readSessionValue,
	SESSION_MAX_AGE_MS,
} from "../src/http/session.ts";

const SECRET = "test-session-secret";
const NOW = 1_700_000_000_000;
const USER = { sub: "uuid-1", username: "hana", role: "admin" };

describe("세션 값", () => {
	it("만들고 다시 읽는다", () => {
		const value = createSessionValue(USER, SECRET, NOW);
		expect(readSessionValue(value, SECRET, NOW)).toEqual({
			...USER,
			exp: NOW + SESSION_MAX_AGE_MS,
		});
	});

	it("다른 비밀키로는 못 읽는다", () => {
		const value = createSessionValue(USER, SECRET, NOW);
		expect(readSessionValue(value, "다른키", NOW)).toBeNull();
	});

	it("payload 를 고치면 서명이 깨진다", () => {
		const value = createSessionValue(USER, SECRET, NOW);
		const [, signature] = value.split(".");
		const forged = Buffer.from(
			JSON.stringify({ ...USER, role: "superadmin", exp: NOW + 1000 }),
			"utf8",
		).toString("base64url");

		expect(readSessionValue(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
	});

	it("만료되면 null", () => {
		const value = createSessionValue(USER, SECRET, NOW);
		expect(readSessionValue(value, SECRET, NOW + SESSION_MAX_AGE_MS + 1)).toBeNull();
	});

	it("비밀키가 비어 있으면 아무것도 통과시키지 않는다", () => {
		const value = createSessionValue(USER, SECRET, NOW);
		expect(readSessionValue(value, "", NOW)).toBeNull();
	});

	it("쓰레기 값에 예외를 던지지 않는다", () => {
		for (const bad of ["", "부분만", "a.b", "....", "!!!.???"]) {
			expect(() => readSessionValue(bad, SECRET, NOW)).not.toThrow();
			expect(readSessionValue(bad, SECRET, NOW)).toBeNull();
		}
	});
});

describe("쿠키", () => {
	it("여러 쿠키 중 이름으로 고른다", () => {
		expect(cookieFrom("theme=dark; session=abc; other=1", "session")).toBe("abc");
	});

	it("없으면 null", () => {
		expect(cookieFrom("theme=dark", "session")).toBeNull();
		expect(cookieFrom(undefined, "session")).toBeNull();
	});

	it("다른 도메인으로 실리려면 SameSite=None 과 Secure 가 같이 있어야 한다", () => {
		const cookie = buildSessionCookie("값");
		expect(cookie).toContain("SameSite=None");
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("HttpOnly");
	});

	it("값이 없으면 지우는 쿠키다", () => {
		expect(buildSessionCookie(null)).toContain("Max-Age=0");
	});
});
