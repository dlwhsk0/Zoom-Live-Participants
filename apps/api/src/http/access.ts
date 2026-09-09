import { bearerFrom, tokensMatch } from "./token.ts";

/**
 * 공개 조회 API 의 공유 토큰.
 *
 * `/api/participants` 는 참가자 실명을 그대로 내준다. CORS 는 브라우저에게
 * 주는 지시일 뿐이라 curl 로 부르면 그대로 나오고, Tailscale 은 DB 만 가린다.
 * 서버가 검사할 수 있는 것은 비밀값뿐이다.
 *
 * 토큰은 화면 번들에 박혀 나간다. 감추는 값이 아니라 **번들을 받을 수 있는
 * 사람에게만 주는 값**이다 — 번들이 사이트 비밀번호 뒤에 있으면, 토큰을
 * 얻으려면 먼저 그 문을 통과해야 한다. 사이트를 잠그지 않으면 이 토큰도
 * 같이 공개되므로, 둘은 세트로 켠다.
 *
 * **비어 있으면 검사하지 않는다.** 배포했다고 화면이 죽지 않게 하기 위해서다.
 */
export const ACCESS_TOKEN_HEADER = "x-access-token";

export function accessAllowed(
	expected: string,
	headers: Record<string, string | string[] | undefined>,
): boolean {
	// 설정하지 않으면 켜지 않는다
	if (!expected) return true;

	const raw = headers[ACCESS_TOKEN_HEADER];
	const provided =
		(Array.isArray(raw) ? raw[0] : raw)?.trim() ||
		bearerFrom(headers.authorization);

	return tokensMatch(provided ?? null, expected);
}
