/**
 * 로그인 시도 제한.
 *
 * 어드민 계정 하나에 비밀번호 하나다. 막지 않으면 그냥 돌려보면 된다.
 * 프로세스 메모리에만 둔다 — 인스턴스가 하나뿐이고, 재시작으로 풀리는
 * 정도는 감수한다. 여러 인스턴스로 늘리면 이건 다시 봐야 한다.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; firstAt: number }>();

/** 지금 시도해도 되는가. */
export function canAttempt(key: string, now: number = Date.now()): boolean {
	const record = attempts.get(key);
	if (!record) return true;

	if (now - record.firstAt > WINDOW_MS) {
		attempts.delete(key);
		return true;
	}

	return record.count < MAX_ATTEMPTS;
}

/** 실패를 센다. 성공하면 clearAttempts 로 지운다. */
export function recordFailure(key: string, now: number = Date.now()): void {
	const record = attempts.get(key);

	if (!record || now - record.firstAt > WINDOW_MS) {
		attempts.set(key, { count: 1, firstAt: now });
		return;
	}

	record.count += 1;
}

export function clearAttempts(key: string): void {
	attempts.delete(key);
}

/** 테스트용. 프로세스 메모리를 비운다. */
export function resetThrottle(): void {
	attempts.clear();
}
