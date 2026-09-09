import { describe, expect, it } from "vitest";
import { z } from "zod";

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

describe("ACCESS_TOKEN", () => {
	// HTTP 헤더는 Latin-1 만 담는다. 한글을 넣으면 브라우저가 못 보내고
	// 화면이 조용히 401 로 죽는다. 기동할 때 걸러야 한다.
	const schema = z
		.string()
		.default("")
		.refine((v) => /^[\x21-\x7e]*$/.test(v), { message: "ASCII 여야 합니다" });

	it("ASCII 토큰을 받는다", () => {
		expect(schema.safeParse("aB3-_~.").success).toBe(true);
	});

	it("비어 있어도 된다 — 그러면 게이트가 꺼진다", () => {
		expect(schema.safeParse("").success).toBe(true);
	});

	it("한글 토큰을 거른다", () => {
		expect(schema.safeParse("공유토큰").success).toBe(false);
	});

	it("공백이 섞이면 거른다", () => {
		expect(schema.safeParse("has space").success).toBe(false);
	});
});
