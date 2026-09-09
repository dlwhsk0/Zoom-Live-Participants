import { beforeEach, describe, expect, it } from "vitest";

import {
	canAttempt,
	clearAttempts,
	recordFailure,
	resetThrottle,
} from "../src/http/login-throttle.ts";

const NOW = 1_700_000_000_000;

describe("로그인 시도 제한", () => {
	beforeEach(() => resetThrottle());

	it("처음에는 허용한다", () => {
		expect(canAttempt("1.2.3.4", NOW)).toBe(true);
	});

	it("10번 실패하면 막는다", () => {
		for (let i = 0; i < 10; i++) recordFailure("1.2.3.4", NOW);
		expect(canAttempt("1.2.3.4", NOW)).toBe(false);
	});

	it("9번까지는 막지 않는다", () => {
		for (let i = 0; i < 9; i++) recordFailure("1.2.3.4", NOW);
		expect(canAttempt("1.2.3.4", NOW)).toBe(true);
	});

	it("10분이 지나면 풀린다", () => {
		for (let i = 0; i < 10; i++) recordFailure("1.2.3.4", NOW);
		expect(canAttempt("1.2.3.4", NOW + 10 * 60 * 1000 + 1)).toBe(true);
	});

	it("성공하면 지운다", () => {
		for (let i = 0; i < 10; i++) recordFailure("1.2.3.4", NOW);
		clearAttempts("1.2.3.4");
		expect(canAttempt("1.2.3.4", NOW)).toBe(true);
	});

	it("다른 IP 는 서로 영향을 주지 않는다", () => {
		for (let i = 0; i < 10; i++) recordFailure("1.2.3.4", NOW);
		expect(canAttempt("5.6.7.8", NOW)).toBe(true);
	});
});
