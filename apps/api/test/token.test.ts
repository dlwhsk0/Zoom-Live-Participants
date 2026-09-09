import { describe, expect, it } from "vitest";

import { bearerFrom, tokensMatch } from "../src/http/token.ts";

describe("tokensMatch", () => {
	it("같으면 참", () => {
		expect(tokensMatch("secret", "secret")).toBe(true);
	});

	it("다르면 거짓", () => {
		expect(tokensMatch("secret", "secreu")).toBe(false);
	});

	it("길이가 달라도 예외를 던지지 않는다", () => {
		expect(() => tokensMatch("s", "secret")).not.toThrow();
		expect(tokensMatch("s", "secret")).toBe(false);
	});

	it("빈 값은 통과시키지 않는다 — 설정 누락이 곧 개방이 되면 안 된다", () => {
		expect(tokensMatch("", "")).toBe(false);
		expect(tokensMatch(null, "")).toBe(false);
		expect(tokensMatch("secret", "")).toBe(false);
		expect(tokensMatch(null, "secret")).toBe(false);
	});
});

describe("bearerFrom", () => {
	it("Bearer 토큰을 떼어낸다", () => {
		expect(bearerFrom("Bearer abc123")).toBe("abc123");
	});

	it("대소문자를 가리지 않는다", () => {
		expect(bearerFrom("bearer abc123")).toBe("abc123");
	});

	it("Bearer 가 아니면 null", () => {
		expect(bearerFrom("Basic abc123")).toBeNull();
		expect(bearerFrom("abc123")).toBeNull();
		expect(bearerFrom(undefined)).toBeNull();
	});
});
