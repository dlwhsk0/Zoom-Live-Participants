/**
 * 하루 한 번, 한국 시간으로 정해진 시각에 일을 돌린다.
 *
 * 크론 라이브러리를 들이지 않는다. 할 일이 하나뿐이고, 다음 시각까지
 * 기다렸다가 돌고 다시 다음 시각을 잡으면 된다.
 *
 * 배포 중 컨테이너가 잠깐 둘이 되면 둘 다 돌 수 있다. 돌리는 일이 멱등이어야
 * 한다 — 백필은 dedupe_key 로 한 번만 들어간다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** now 다음으로 오는 한국 시간 hour:minute 까지 남은 밀리초. 지금 막 그 시각이면 내일. */
export function msUntilNextKst(now: Date, hour: number, minute: number): number {
	const shifted = now.getTime() + KST_OFFSET_MS;
	const midnight = shifted - (shifted % DAY_MS);
	let next = midnight + (hour * 60 + minute) * 60 * 1000;
	if (next <= shifted) next += DAY_MS;
	return next - shifted;
}

/** 돌리기 시작한다. 돌려받은 함수를 부르면 멈춘다. */
export function scheduleDailyKst(
	hour: number,
	minute: number,
	task: () => Promise<void>,
): () => void {
	let timer: NodeJS.Timeout | null = null;
	let stopped = false;

	const arm = () => {
		if (stopped) return;
		timer = setTimeout(async () => {
			try {
				await task();
			} catch (error) {
				console.error("[daily] 실패", error);
			}
			arm();
		}, msUntilNextKst(new Date(), hour, minute));
		// 이 타이머 때문에 프로세스가 안 끝나는 일은 없게 한다
		timer.unref();
	};

	arm();

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
