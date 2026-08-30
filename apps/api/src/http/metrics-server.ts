import { createServer, type Server } from "node:http";

import { getEnv } from "../config/env.ts";
import { getDb } from "../db/client.ts";
import { register, registerRuntimeGauges } from "../metrics.ts";
import { getPresenceSnapshot } from "../repository/query.ts";

/**
 * 메트릭 전용 서버.
 *
 * 서비스 포트와 분리해서 띄운다.
 * Traefik 은 도메인을 하나의 포트로만 라우팅하므로,
 * 이 포트를 도메인에 연결하지 않으면 /metrics 는 외부에 노출되지 않는다.
 * Prometheus 가 도커 네트워크 안에서 http://<서비스>:<METRICS_PORT>/metrics 로 긁는다.
 *
 * METRICS_TOKEN 을 설정하면 Bearer 헤더나 ?token= 을 추가로 요구한다.
 */
export function createMetricsServer(): Server {
	const env = getEnv();

	registerRuntimeGauges({
		presence: async () => {
			const meetingId = env.ZOOM_MEETING_ID;
			if (!meetingId) return null;

			const snapshot = await getPresenceSnapshot(getDb(), meetingId);
			return { online: snapshot.count, total: snapshot.totalCount };
		},
	});

	return createServer((req, res) => {
		const url = req.url ?? "";

		if (!url.startsWith("/metrics")) {
			res.writeHead(404);
			res.end();
			return;
		}

		if (env.METRICS_TOKEN) {
			const byHeader = req.headers.authorization === `Bearer ${env.METRICS_TOKEN}`;
			const byQuery = url.includes(`token=${env.METRICS_TOKEN}`);
			if (!byHeader && !byQuery) {
				res.writeHead(401);
				res.end();
				return;
			}
		}

		register
			.metrics()
			.then((body) => {
				res.writeHead(200, { "content-type": register.contentType });
				res.end(body);
			})
			.catch((error) => {
				console.error("[metrics] 수집 실패", error);
				res.writeHead(500);
				res.end();
			});
	});
}
