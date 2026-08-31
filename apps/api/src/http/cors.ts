import { getEnv } from "../config/env.ts";

/**
 * 프론트와 백엔드가 다른 도메인에 배포되므로 CORS 가 필요하다.
 *
 * 허용 오리진은 CORS_ALLOWED_ORIGINS 로 지정한다(쉼표 구분).
 * 비워두면 모든 오리진을 허용한다 — 로컬 개발용이며 운영에서는 지정해야 한다.
 */
export function corsHeaders(requestOrigin: string | null): Record<string, string> {
	const allowed = getEnv().CORS_ALLOWED_ORIGINS;

	const base: Record<string, string> = {
		"access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
		"access-control-allow-headers": "content-type,accept",
		"access-control-max-age": "86400",
	};

	if (allowed.length === 0) {
		return { ...base, "access-control-allow-origin": "*" };
	}

	if (requestOrigin && allowed.includes(requestOrigin)) {
		return {
			...base,
			"access-control-allow-origin": requestOrigin,
			// 오리진별로 응답이 달라지므로 캐시가 섞이지 않게 한다
			vary: "Origin",
		};
	}

	// 허용 목록에 없으면 CORS 헤더를 주지 않는다. 브라우저가 차단한다.
	return { ...base, vary: "Origin" };
}
