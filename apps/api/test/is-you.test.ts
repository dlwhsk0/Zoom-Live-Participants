import { describe, expect, it } from "vitest";

import { clientIpFrom } from "../src/http/client-ip.ts";

describe("clientIpFrom", () => {
	it("X-Forwarded-For 의 맨 앞을 쓴다 — 원 클라이언트", () => {
		expect(clientIpFrom({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" })).toBe(
			"1.2.3.4",
		);
	});

	it("공백을 다듬는다", () => {
		expect(clientIpFrom({ "x-forwarded-for": "  1.2.3.4  " })).toBe("1.2.3.4");
	});

	it("IPv6 로 감싼 IPv4 를 벗긴다 — Zoom 은 IPv4 를 준다", () => {
		expect(clientIpFrom({ "x-forwarded-for": "::ffff:1.2.3.4" })).toBe("1.2.3.4");
	});

	it("헤더가 배열로 와도 처리한다", () => {
		expect(clientIpFrom({ "x-forwarded-for": ["1.2.3.4", "5.6.7.8"] })).toBe(
			"1.2.3.4",
		);
	});

	it("헤더가 없으면 null", () => {
		expect(clientIpFrom({})).toBeNull();
		expect(clientIpFrom({ "x-forwarded-for": "" })).toBeNull();
	});
});
