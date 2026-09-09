import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../src/http/password.ts";

describe("비밀번호 해시", () => {
	it("맞는 비밀번호를 통과시킨다", async () => {
		const hash = await hashPassword("바른비밀번호");
		expect(await verifyPassword("바른비밀번호", hash)).toBe(true);
	});

	it("틀린 비밀번호를 막는다", async () => {
		const hash = await hashPassword("바른비밀번호");
		expect(await verifyPassword("틀린비밀번호", hash)).toBe(false);
	});

	it("같은 비밀번호라도 해시가 매번 다르다 — salt", async () => {
		const a = await hashPassword("같은값");
		const b = await hashPassword("같은값");
		expect(a).not.toBe(b);
		expect(await verifyPassword("같은값", a)).toBe(true);
		expect(await verifyPassword("같은값", b)).toBe(true);
	});

	it("파라미터를 값 안에 담는다 — 나중에 세기를 올려도 옛 해시를 검증한다", async () => {
		const hash = await hashPassword("아무거나");
		expect(hash.startsWith("scrypt$16384$8$1$")).toBe(true);
	});

	it("형식이 깨진 해시는 통과시키지 않는다", async () => {
		for (const bad of ["", "plain", "scrypt$$$$", "bcrypt$16384$8$1$a$b", "scrypt$x$8$1$YQ==$Yg=="]) {
			expect(await verifyPassword("아무거나", bad)).toBe(false);
		}
	});
});
