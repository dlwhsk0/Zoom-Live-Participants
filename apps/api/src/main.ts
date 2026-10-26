/** 백엔드 서버 진입점. Dokploy 컨테이너가 이 파일을 실행한다. */
import { getEnv } from "./config/env.ts";
import { getDb } from "./db/client.ts";
import { createMetricsServer } from "./http/metrics-server.ts";
import { createApiServer, installShutdownHandlers } from "./http/server.ts";
import { enableSessionBackfill, runDailyBackfill } from "./jobs/backfill.ts";
import { scheduleDailyKst } from "./jobs/daily.ts";
import { SOURCE_FINGERPRINT } from "./version.ts";
import { createZoomReportClient, zoomCredentialsFrom } from "./zoom/report-api.ts";

const env = getEnv();
const server = createApiServer();

installShutdownHandlers(server);

const metricsServer = createMetricsServer();

// 웹훅을 놓친 입퇴장을 Report API 로 메꾼다.
//   - meeting.ended 를 받으면 그 세션을 (webhook/handle.ts)
//   - 매일 04:30 최근 며칠치를 — 서버가 끊긴 동안 회의가 끝나면 meeting.ended
//     자체를 못 받는다. 그 세션을 줍는 안전망이다
const zoomCredentials = zoomCredentialsFrom(env);
const backfillMeetingId = env.ZOOM_MEETING_ID;
if (zoomCredentials && backfillMeetingId) {
	const zoom = createZoomReportClient(zoomCredentials);
	enableSessionBackfill(getDb(), zoom);
	scheduleDailyKst(4, 30, () =>
		runDailyBackfill(getDb(), zoom, backfillMeetingId),
	);
}

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
	console.log(`  GET  /api/logs`);
	console.log(`  PUT  /api/participants/:uuid/status`);
	console.log(`  POST /api/webhook`);
	console.log(
		`  BACKFILL: ${
			zoomCredentials && backfillMeetingId
				? "회의가 끝나면(그리고 매일 04:30 KST 에) Report API 로 놓친 입퇴장을 메꾼다"
				: "꺼짐 (ZOOM_ACCOUNT_ID · ZOOM_CLIENT_ID · ZOOM_CLIENT_SECRET · ZOOM_MEETING_ID 가 필요하다)"
		}`,
	);
	console.log(
		`  CORS: ${
			env.CORS_ALLOWED_ORIGINS.length
				? env.CORS_ALLOWED_ORIGINS.join(", ")
				: "* (모두 허용 — 운영에서는 CORS_ALLOWED_ORIGINS 를 지정하세요)"
		}`,
	);
});
