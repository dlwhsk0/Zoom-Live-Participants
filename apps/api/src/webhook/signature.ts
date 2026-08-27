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

	return { ok: true };
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
