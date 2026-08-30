import { describe, expect, it } from "vitest";

import {
	register,
	registerRuntimeGauges,
	roomMoves,
	webhooksReceived,
	webhooksRejected,
} from "../src/metrics.ts";

describe("metrics", () => {
	it("기본 프로세스 메트릭을 수집한다", async () => {
		const text = await register.metrics();
		expect(text).toContain("process_cpu_seconds_total");
		expect(text).toContain("nodejs_eventloop_lag_seconds");
	});

	it("앱 라벨을 붙인다", async () => {
		webhooksReceived.inc({ event: "participant_joined" });
		const text = await register.metrics();
		expect(text).toContain('app="zoom-live-participants-api"');
	});

	it("웹훅 카운터를 이벤트별로 나눈다", async () => {
		webhooksReceived.inc({ event: "participant_left" });
		const text = await register.metrics();
		expect(text).toMatch(/zlp_webhooks_received_total\{event="participant_left"/);
	});

	it("거부 사유를 라벨로 남긴다", async () => {
		webhooksRejected.inc({ reason: "signature mismatch" });
		const text = await register.metrics();
		expect(text).toMatch(/zlp_webhooks_rejected_total\{reason="signature mismatch"/);
	});

	it("방 이동 카운터가 있다 — 판정 규칙의 핵심이라 따로 센다", async () => {
		roomMoves.inc();
		const text = await register.metrics();
		expect(text).toContain("zlp_room_moves_total");
	});

	it("웹훅 처리 시간 히스토그램에 3초 버킷이 있다 — Zoom 의 응답 요구", async () => {
		const text = await register.metrics();
		expect(text).toMatch(/zlp_webhook_duration_seconds_bucket\{le="3"/);
	});
});

describe("registerRuntimeGauges", () => {
	it("DB 조회가 실패해도 db_up 을 0 으로 내리고 나머지는 계속 나간다", async () => {
		registerRuntimeGauges({
			presence: async () => {
				throw new Error("db down");
			},
		});

		const text = await register.metrics();
		expect(text).toMatch(/zlp_db_up\{[^}]*\}\s+0/);
		// DB 가 죽어도 프로세스 메트릭은 유지된다
		expect(text).toContain("process_cpu_seconds_total");
	});
});
