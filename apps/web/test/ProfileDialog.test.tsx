import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SessionParticipant } from "../src/api.ts";
import ProfileDialog from "../src/ProfileDialog.tsx";

const now = Date.now();

const base: SessionParticipant = {
	participantUuid: "p1",
	connectionCount: 1,
	displayName: "조하나",
	firstJoinedAt: new Date(now - 130 * 60_000).toISOString(),
	isPresent: true,
	lastOccurredAt: new Date(now - 60_000).toISOString(),
	onlineSeconds: 130 * 60,
	statusMessage: null,
	joinTimeUncertain: false,
	isYou: false,
};

function render(overrides: Partial<SessionParticipant> = {}): string {
	return renderToString(
		createElement(ProfileDialog, {
			participant: { ...base, ...overrides },
			now,
			onSave: async () => {},
			onClose: () => {},
		}),
	);
}

describe("ProfileDialog", () => {
	it("이름과 누적 시간을 보여준다", () => {
		const html = render();
		expect(html).toContain("조하나");
		expect(html).toContain("접속 중 · 2시간 10분");
	});

	it("나간 사람은 퇴장 시각과 머문 시간을 함께 보여준다", () => {
		const html = render({ isPresent: false });
		expect(html).toContain("퇴장");
		expect(html).toContain("머문 시간 2시간 10분");
	});

	it("접속이 여럿이면 횟수를 밝힌다", () => {
		expect(render({ connectionCount: 3 })).toContain("접속 3회");
		expect(render({ connectionCount: 1 })).not.toContain("접속 1회");
	});

	it("상태 메시지를 전문으로 보여준다", () => {
		const long = "이번주까지 논문 마감이라 정신이 하나도 없습니다";
		expect(render({ statusMessage: long })).toContain(long);
	});

	it("상태 메시지가 없으면 그렇게 알린다", () => {
		expect(render()).toContain("상태 메시지가 없습니다");
	});

	it("유튜브 주소를 진짜 링크로 만든다", () => {
		const html = render({ statusMessage: "공부 브금 youtu.be/dQw4w9WgXcQ" });

		expect(html).toContain('href="https://youtu.be/dQw4w9WgXcQ"');
		expect(html).toContain("유튜브에서 열기");
		// 주소는 글에서 걷어내고 링크로만 남는다
		expect(html).toContain("공부 브금");
	});

	it("새 탭이 원래 창을 건드리지 못하게 한다", () => {
		const html = render({ statusMessage: "youtu.be/abc" });
		expect(html).toMatch(/rel="noopener noreferrer nofollow"/);
	});

	it("유튜브가 아닌 주소는 링크로 만들지 않는다", () => {
		// 상태 메시지는 아무나 쓸 수 있다. 아무 주소나 열어주면 피싱에 쓰인다
		const html = render({ statusMessage: "여기 봐 https://evil.example.com/x" });

		expect(html).not.toContain("href=\"https://evil.example.com/x\"");
		expect(html).toContain("evil.example.com");
	});

	it("수정으로 들어가는 길을 둔다", () => {
		expect(render()).toContain("상태 메시지 수정");
	});

	it("본인으로 추정되면 표시를 붙인다", () => {
		expect(render({ isYou: true })).toContain("(나)");
	});
});
