import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AdminActions from "../src/AdminActions.tsx";
import type { AdminAction } from "../src/api.ts";

function render(actions: AdminAction[]): string {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(["adminActions"], actions);

	return renderToString(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(AdminActions, { onToast: () => {} }),
		),
	);
}

function statusChange(overrides: Partial<AdminAction> = {}): AdminAction {
	return {
		id: "a1",
		createdAt: "2026-09-12T13:16:00Z",
		action: "status",
		meetingUuid: "u",
		clientIp: "124.51.207.99",
		actor: { ip: "124.51.207.99", name: "황건하", candidates: 1 },
		targets: [{ participantUuid: "p1", before: null, displayName: "박채연" }],
		detail: { after: "아우졸려", targets: [{ participantUuid: "p1", before: null }] },
		...overrides,
	} as AdminAction;
}

describe("기록 — 누가 고쳤는가", () => {
	it("고친 사람 이름을 앞세운다", () => {
		const html = render([statusChange()]);

		expect(html).toContain("황건하");
		expect(html).toContain("record__actor");
	});

	it("누구를 고쳤는지 함께 보여준다", () => {
		expect(render([statusChange()])).toContain("박채연 님의 상태 메시지");
	});

	it("어느 IP 에서 고쳤는지 남긴다", () => {
		expect(render([statusChange()])).toContain("124.51.207.99");
	});

	it("바뀐 값을 전후로 보여준다", () => {
		const html = render([statusChange()]);

		expect(html).toContain("(비어 있음)");
		expect(html).toContain("아우졸려");
	});

	it("지운 것과 빈 값을 구분한다", () => {
		const html = render([
			statusChange({
				targets: [{ participantUuid: "p1", before: "로블록스", displayName: "이혜령" }],
				detail: { after: undefined, targets: [{ participantUuid: "p1", before: "로블록스" }] },
			}),
		]);

		expect(html).toContain("(지움)");
	});

	it("같은 IP 를 여럿이 쓰면 이름을 단정하지 않는다", () => {
		const html = render([
			statusChange({ actor: { ip: "223.33.17.199", name: null, candidates: 3 } }),
		]);

		expect(html).toContain("3명 중 한 명");
		expect(html).toContain("record__actor--unknown");
		expect(html).not.toContain("황건하");
	});

	it("이름도 후보도 없으면 IP 를 그대로 쓴다", () => {
		const html = render([
			statusChange({ actor: { ip: "10.0.0.1", name: null, candidates: 0 } }),
		]);

		expect(html).toContain("10.0.0.1");
	});

	it("상태 변경은 되돌릴 수 있다", () => {
		expect(render([statusChange()])).toContain("되돌리기");
	});

	it("별칭 작업에는 되돌리기를 두지 않는다", () => {
		const html = render([
			statusChange({
				action: "alias.put",
				targets: [],
				detail: { alias: "Chloe", canonical: "이도경" },
			}),
		]);

		expect(html).toContain("Chloe");
		expect(html).not.toContain("되돌리기");
	});

	it("기록이 없으면 그렇게 알린다", () => {
		expect(render([])).toContain("고친 기록이 없습니다");
	});
});
