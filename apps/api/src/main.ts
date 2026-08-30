/** 백엔드 서버 진입점. Dokploy 컨테이너가 이 파일을 실행한다. */
import { getEnv } from "./config/env.ts";
import { createMetricsServer } from "./http/metrics-server.ts";
import { createApiServer, installShutdownHandlers } from "./http/server.ts";
import { SOURCE_FINGERPRINT } from "./version.ts";

const env = getEnv();
const server = createApiServer();

installShutdownHandlers(server);

const metricsServer = createMetricsServer();

metricsServer.listen(env.METRICS_PORT, () => {
	console.log(
		`metrics on :${env.METRICS_PORT}/metrics (비공개 — 도메인에 연결하지 않는다)`,
	);
});

server.listen(env.PORT, () => {
	console.log(`api listening on :${env.PORT}  (source ${SOURCE_FINGERPRINT})`);
	console.log(`  GET  /health`);
	console.log(`  GET  /health/db`);
	console.log(`  GET  /api/participants`);
	console.log(`  PUT  /api/participants/:uuid/status`);
	console.log(`  POST /api/webhook`);
	console.log(
		`  CORS: ${
			env.CORS_ALLOWED_ORIGINS.length
				? env.CORS_ALLOWED_ORIGINS.join(", ")
				: "* (모두 허용 — 운영에서는 CORS_ALLOWED_ORIGINS 를 지정하세요)"
		}`,
	);
});
