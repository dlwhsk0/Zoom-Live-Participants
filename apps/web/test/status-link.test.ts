import { describe, expect, it } from "vitest";

import { parseStatus, parseYoutube } from "../src/status-link.ts";

describe("parseYoutube", () => {
	it("유튜브 주소를 받는다", () => {
		expect(parseYoutube("https://youtu.be/dQw4w9WgXcQ")).toBe(
			"https://youtu.be/dQw4w9WgXcQ",
		);
		expect(parseYoutube("https://www.youtube.com/watch?v=abc")).toBe(
			"https://www.youtube.com/watch?v=abc",
		);
	});

	it("스킴이 없어도 붙여서 읽는다", () => {
		// 사람들은 youtu.be/... 로만 적는다
		expect(parseYoutube("youtu.be/dQw4w9WgXcQ")).toBe(
			"https://youtu.be/dQw4w9WgXcQ",
		);
	});

	it("http 는 https 로 올린다", () => {
		expect(parseYoutube("http://youtu.be/abc")).toBe("https://youtu.be/abc");
	});

	it("유튜브가 아니면 거절한다", () => {
		expect(parseYoutube("https://example.com/abc")).toBeNull();
		expect(parseYoutube("https://evil.com/youtu.be/abc")).toBeNull();
	});

	it("유튜브를 흉내낸 호스트도 거절한다", () => {
		// 상태 메시지는 아무나 쓸 수 있다. 여기가 뚫리면 남의 타일에 피싱을 건다.
		expect(parseYoutube("https://youtube.com.evil.kr/abc")).toBeNull();
		expect(parseYoutube("https://notyoutube.com/abc")).toBeNull();
		expect(parseYoutube("https://youtu.be.evil.com/abc")).toBeNull();
	});

	it("javascript: 같은 스킴을 거절한다", () => {
		expect(parseYoutube("javascript:alert(1)")).toBeNull();
		expect(parseYoutube("data:text/html,<script>")).toBeNull();
		expect(parseYoutube("javascript://youtu.be/%0aalert(1)")).toBeNull();
	});

	it("주소가 아니면 null 이다", () => {
		expect(parseYoutube("그냥 글")).toBeNull();
		expect(parseYoutube("")).toBeNull();
	});

	it("끝에 붙은 문장부호는 떼어낸다", () => {
		expect(parseYoutube("youtu.be/abc.")).toBe("https://youtu.be/abc");
		expect(parseYoutube("youtu.be/abc)")).toBe("https://youtu.be/abc");
	});
});

describe("parseStatus", () => {
	it("글과 링크를 가른다", () => {
		expect(parseStatus("공부 브금 youtu.be/abc")).toEqual({
			text: "공부 브금",
			youtube: "https://youtu.be/abc",
		});
	});

	it("링크만 있으면 글은 빈다", () => {
		expect(parseStatus("https://youtu.be/abc")).toEqual({
			text: "",
			youtube: "https://youtu.be/abc",
		});
	});

	it("링크가 없으면 글만 준다", () => {
		expect(parseStatus("집중 중")).toEqual({ text: "집중 중", youtube: null });
	});

	it("유튜브가 아닌 주소는 글에 남는다", () => {
		// 링크로 만들지 않을 뿐 지우지는 않는다. 적은 것을 삼키면 안 된다.
		const parsed = parseStatus("여기 봐 https://example.com/x");
		expect(parsed.youtube).toBeNull();
		expect(parsed.text).toContain("example.com");
	});

	it("링크를 걷어낸 자리의 공백을 정리한다", () => {
		expect(parseStatus("앞  youtu.be/abc  뒤").text).toBe("앞 뒤");
	});

	it("여러 개면 첫 번째만 쓴다", () => {
		const parsed = parseStatus("youtu.be/one youtu.be/two");
		expect(parsed.youtube).toBe("https://youtu.be/one");
	});

	it("빈 값을 견딘다", () => {
		expect(parseStatus(null)).toEqual({ text: "", youtube: null });
		expect(parseStatus("")).toEqual({ text: "", youtube: null });
	});
});
