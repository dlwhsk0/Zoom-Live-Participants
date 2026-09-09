import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// getEnv 는 첫 요청에서야 불린다. 그 전에 채운다.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.ZOOM_WEBHOOK_SECRET_TOKEN ??= "test-secret";
process.env.ACCESS_TOKEN = "gate-token-1234";

const { createApiServer } = await import("../src/http/server.ts");

let server: Server;
let origin: string;

beforeAll(async () => {
	server = createApiServer();
	await new Promise<void>((resolve) => server.listen(0, resolve));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("공유 토큰 게이트", () => {
	it("토큰 없이 조회하면 401 — DB 에 닿기 전에 막는다", async () => {
		const response = await fetch(`${origin}/api/participants`);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ ok: false, reason: "unauthorized" });
	});

	it("틀린 토큰도 401", async () => {
		const response = await fetch(`${origin}/api/participants`, {
			headers: { "x-access-token": "wrong-token" },
		});

		expect(response.status).toBe(401);
	});

	it("상태 메시지 쓰기도 막는다", async () => {
		const response = await fetch(`${origin}/api/participants/uuid-1/status`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "몰래 바꾸기" }),
		});

		expect(response.status).toBe(401);
	});

	it("헬스체크는 막지 않는다 — 컨테이너가 부른다", async () => {
		expect((await fetch(`${origin}/health`)).status).toBe(200);
	});

	it("robots.txt 도 막지 않는다", async () => {
		expect((await fetch(`${origin}/robots.txt`)).status).toBe(200);
	});

	it("프리플라이트에서 x-access-token 을 허용한다", async () => {
		const response = await fetch(`${origin}/api/participants`, { method: "OPTIONS" });

		expect(response.headers.get("access-control-allow-headers")).toContain(
			"x-access-token",
		);
	});
});
