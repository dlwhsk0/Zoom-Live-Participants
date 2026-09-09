import { timingSafeEqual } from "node:crypto";

/**
 * 토큰 비교. 길이가 달라도 예외를 던지지 않고 상수 시간으로 본다.
 *
 * `a !== b` 는 앞에서부터 비교하다 다른 글자를 만나면 바로 멈춘다.
 * 그 시간 차이를 재면 토큰을 한 글자씩 맞춰 나갈 수 있다.
 */
export function tokensMatch(provided: string | null, expected: string): boolean {
	if (!provided || !expected) return false;

	const left = Buffer.from(provided, "utf8");
	const right = Buffer.from(expected, "utf8");

	if (left.length !== right.length) {
		// 길이가 다르면 비교할 필요가 없지만, 조기 반환 타이밍이
		// 길이를 흘리지 않도록 더미 비교를 한 번 수행한다.
		timingSafeEqual(left, left);
		return false;
	}

	return timingSafeEqual(left, right);
}

/** `Authorization: Bearer <token>` 에서 토큰만 떼어낸다. */
export function bearerFrom(
	header: string | string[] | undefined,
): string | null {
	const raw = Array.isArray(header) ? header[0] : header;
	if (typeof raw !== "string") return null;

	const match = raw.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || null;
}
