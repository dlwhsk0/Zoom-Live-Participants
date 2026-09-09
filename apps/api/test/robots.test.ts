import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiServer } from "../src/http/server.ts";

// getEnv 는 첫 요청에서야 불린다. 그 전에 채워 두면 된다.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.ZOOM_WEBHOOK_SECRET_TOKEN ??= "test-secret";

let server: Server;
let origin: string;

beforeAll(async () => {
	server = createApiServer();
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const { port } = server.address() as AddressInfo;
	origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("검색엔진 차단", () => {
	it("robots.txt 가 전 경로를 막는다", async () => {
		const response = await fetch(`${origin}/robots.txt`);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/plain");
		// JSON 으로 감싸지 않고 본문 그대로 나가야 한다
		expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
	});

	it("robots.txt 를 안 읽고 온 크롤러도 헤더로 막는다", async () => {
		const response = await fetch(`${origin}/health`);

		expect(response.status).toBe(200);
		expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
	});

	it("없는 경로의 응답에도 붙는다", async () => {
		const response = await fetch(`${origin}/이런건없다`);

		expect(response.status).toBe(404);
		expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
	});
});
