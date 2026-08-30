/**
 * 요청을 보낸 클라이언트의 공인 IP.
 *
 * Traefik 뒤에 있으므로 소켓 주소는 프록시의 것이다. X-Forwarded-For 를 본다.
 *
 * **주의: 이 값은 위조할 수 있다.** 권한 판단에 쓰면 안 된다.
 * 지금은 "이 사람이 아마 당신일 것"이라는 힌트에만 쓴다.
 * 틀려도 확인창이 한 번 더 뜨는 것 이상의 일은 일어나지 않는다.
 */
export function clientIpFrom(
	headers: Record<string, string | string[] | undefined>,
): string | null {
	const forwarded = headers["x-forwarded-for"];
	const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;

	if (!raw) return null;

	// "client, proxy1, proxy2" 형태. 맨 앞이 원 클라이언트다.
	const first = raw.split(",")[0]?.trim();
	if (!first) return null;

	// IPv6 로 감싼 IPv4 (::ffff:1.2.3.4) 를 벗긴다.
	// Zoom 은 IPv4 를 주므로 이걸 벗겨야 매칭된다.
	return first.replace(/^::ffff:/i, "");
}
