import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Zoom 웹훅 서명 검증.
 *
 * v1은 secret 이 없으면 검증을 통과시켰다(fail-open).
 * 배포 환경에서 env 가 누락되면 인증 없는 공개 엔드포인트가 된다.
 * 여기서는 secret 이 없으면 거부한다(fail-closed).
 */
export type VerifyResult =
	| { ok: true }
	| { ok: false; reason: string };

/**
 * 이보다 오래되거나 앞선 요청은 서명이 맞아도 거부한다.
 *
 * 서명만 보면 같은 요청을 몇 번이고 다시 보낼 수 있다. 한 번 가로챈
 * 입장 이벤트를 계속 재생하면 기록이 오염된다. 시각을 함께 봐야 막힌다.
 *
 * 양쪽으로 5분을 준다. 서버와 Zoom 의 시계가 조금 어긋날 수 있다.
 */
export const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/** 길이가 달라도 예외를 던지지 않는 상수 시간 비교. */
function safeEquals(a: string, b: string): boolean {
	const left = Buffer.from(a, "utf8");
	const right = Buffer.from(b, "utf8");

	if (left.length !== right.length) {
		// 길이 자체가 다르면 비교할 필요가 없지만,
		// 조기 반환 타이밍이 정보를 흘리지 않도록 더미 비교를 수행한다.
		timingSafeEqual(left, left);
		return false;
	}

	return timingSafeEqual(left, right);
}

export function verifySignature(
	secretToken: string,
	headers: Record<string, string | string[] | undefined>,
	rawBody: string,
	now: number = Date.now(),
): VerifyResult {
	if (!secretToken) {
		return { ok: false, reason: "webhook secret is not configured" };
	}

	const signature = headers["x-zm-signature"];
	const timestamp = headers["x-zm-request-timestamp"];

	if (typeof signature !== "string" || typeof timestamp !== "string") {
		return { ok: false, reason: "missing signature headers" };
	}

	const message = `v0:${timestamp}:${rawBody}`;
	const expected = `v0=${createHmac("sha256", secretToken)
		.update(message)
		.digest("hex")}`;

	if (!safeEquals(signature, expected)) {
		return { ok: false, reason: "signature mismatch" };
	}

	// 서명이 맞은 다음에 본다. 서명도 못 맞춘 쪽에는 시각 처리를 알려줄 이유가 없다.
	const sentAt = toMillis(timestamp);

	if (sentAt === null) {
		return { ok: false, reason: "invalid timestamp" };
	}

	if (Math.abs(now - sentAt) > MAX_TIMESTAMP_SKEW_MS) {
		return { ok: false, reason: "timestamp out of range" };
	}

	return { ok: true };
}

/**
 * Zoom 의 타임스탬프를 밀리초로 맞춘다.
 *
 * 초로 오는 것을 봤지만 밀리초로 적힌 문서도 있다. 여기서 잘못 읽으면
 * 정상 웹훅을 전부 거부하게 되므로 자릿수로 갈라 양쪽을 다 받는다.
 * 1e11 초는 5138년이다. 그보다 크면 밀리초로 본다.
 */
function toMillis(timestamp: string): number | null {
	const value = Number(timestamp);

	if (!Number.isFinite(value) || value <= 0) return null;

	return value > 1e11 ? value : value * 1000;
}

/** Zoom 이 엔드포인트 등록 시 보내는 검증 요청에 대한 응답. */
export function buildUrlValidationResponse(
	secretToken: string,
	plainToken: string,
): { plainToken: string; encryptedToken: string } {
	return {
		plainToken,
		encryptedToken: createHmac("sha256", secretToken)
			.update(plainToken)
			.digest("hex"),
	};
}
