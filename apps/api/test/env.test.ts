import { describe, expect, it } from "vitest";

import { parseOriginList } from "../src/config/env.ts";

describe("parseOriginList", () => {
	it("하나만 있으면 그대로", () => {
		expect(parseOriginList("https://a.com")).toEqual(["https://a.com"]);
	});

	it("쉼표로 여러 개", () => {
		expect(parseOriginList("https://a.com,https://b.com")).toEqual([
			"https://a.com",
			"https://b.com",
		]);
	});

	it("쉼표 주변 공백을 다듬는다", () => {
		expect(parseOriginList(" https://a.com , https://b.com ")).toEqual([
			"https://a.com",
			"https://b.com",
		]);
	});

	it("JSON 배열 표기도 받는다", () => {
		expect(parseOriginList('["https://a.com", "https://b.com"]')).toEqual([
			"https://a.com",
			"https://b.com",
		]);
	});

	it("끝의 슬래시를 떼어낸다 — Origin 헤더에는 없다", () => {
		expect(parseOriginList("https://a.com/")).toEqual(["https://a.com"]);
		expect(parseOriginList('["https://a.com/"]')).toEqual(["https://a.com"]);
	});

	it("빈 값은 빈 배열", () => {
		expect(parseOriginList("")).toEqual([]);
		expect(parseOriginList("   ")).toEqual([]);
	});

	it("깨진 JSON 은 쉼표 구분으로 넘어간다", () => {
		expect(parseOriginList('["https://a.com"')).toEqual(["https://a.com"]);
	});

	it("빈 항목은 버린다", () => {
		expect(parseOriginList("https://a.com,,https://b.com,")).toEqual([
			"https://a.com",
			"https://b.com",
		]);
	});
});
