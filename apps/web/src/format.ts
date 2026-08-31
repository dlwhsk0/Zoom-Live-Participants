/** 접속 경과 시간을 사람이 읽는 형태로. */
export function formatElapsed(from: string | null, now: number): string {
	if (!from) return "";

	const started = Date.parse(from);
	if (Number.isNaN(started)) return "";

	const seconds = Math.max(0, Math.floor((now - started) / 1000));
	if (seconds < 60) return "방금";

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}분`;

	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 마지막 갱신 시각을 "N초 전" 으로. */
export function formatAgo(at: number | null, now: number): string {
	if (at === null) return "—";

	const seconds = Math.max(0, Math.floor((now - at) / 1000));
	if (seconds < 5) return "방금 기준";
	if (seconds < 60) return `${seconds}초 전 기준`;

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}분 전 기준`;

	return `${Math.floor(minutes / 60)}시간 전 기준`;
}

/** 퇴장 시각을 "N분 전 퇴장" 으로. */
export function formatLeftAgo(at: string | null, now: number): string {
	if (!at) return "퇴장";

	const left = Date.parse(at);
	if (Number.isNaN(left)) return "퇴장";

	const seconds = Math.max(0, Math.floor((now - left) / 1000));
	if (seconds < 60) return "방금 퇴장";

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}분 전 퇴장`;

	const hours = Math.floor(minutes / 60);
	return `${hours}시간 전 퇴장`;
}

/**
 * 회의 시작 시각을 "8월 30일 (일) 오후 4:23" 으로.
 *
 * 보는 사람의 시간대로 표시한다. 서버는 UTC 로 내려준다.
 */
export function formatSessionStart(at: string | null): string {
	if (!at) return "";

	const started = new Date(at);
	if (Number.isNaN(started.getTime())) return "";

	return started.toLocaleString("ko-KR", {
		month: "long",
		day: "numeric",
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * 지금 시점의 누적 접속 시간(초).
 *
 * 서버가 주는 onlineSeconds 는 닫힌 구간의 합이라 진행 중인 구간이 빠져 있다.
 * 접속 중이면 마지막 입장 이후 흐른 시간을 더한다.
 * (접속 중일 때 lastOccurredAt 은 곧 마지막 입장 시각이다.)
 */
export function totalOnlineSeconds(
	participant: {
		onlineSeconds: number;
		isPresent: boolean;
		lastOccurredAt: string;
	},
	now: number,
): number {
	if (!participant.isPresent) return participant.onlineSeconds;

	const since = Date.parse(participant.lastOccurredAt);
	if (Number.isNaN(since)) return participant.onlineSeconds;

	return participant.onlineSeconds + Math.max(0, (now - since) / 1000);
}

/**
 * 누적 시간을 "4시간 06분" / "23분" 으로.
 *
 * 1분이 안 되면 "0분" 대신 "방금 전". 방금 들어온 사람에게
 * 0 을 보여주면 기록이 안 잡힌 것처럼 읽힌다.
 */
export function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds / 60));
	if (total === 0) return "방금 전";

	const hours = Math.floor(total / 60);
	const minutes = total % 60;

	if (hours === 0) return `${minutes}분`;
	if (minutes === 0) return `${hours}시간`;
	return `${hours}시간 ${minutes}분`;
}

/**
 * 접속 중인 사람의 불꽃 단계 (0~4).
 *
 *   0  ~30분     아무것도 없다
 *   1  30분~1시간 아이콘만 또렷해진다. 아직 불은 아니다
 *   2  1~3시간    불이 붙는다
 *   3  3~5시간    카드 배경까지 달아오른다
 *   4  5시간~     불꽃이 파래진다. 더 뜨거운 불이다
 *
 * 경계는 실제 세션의 분포를 보고 잡았다. 위로 갈수록 드물어야 목표가 된다.
 * 관측된 최고 기록이 4시간 17분이라 4단계는 아직 아무도 닿지 못했다.
 */
export function studyTier(seconds: number): 0 | 1 | 2 | 3 | 4 {
	if (seconds >= 5 * 3600) return 4;
	if (seconds >= 3 * 3600) return 3;
	if (seconds >= 3600) return 2;
	if (seconds >= 30 * 60) return 1;
	return 0;
}

/**
 * 나간 사람의 휴식 단계 (0~3).
 *
 *   0  ~1시간    커피. 잠깐 자리를 비운 것으로 본다
 *   1  1~3시간   졸기 시작
 *   2  3~5시간   자는 얼굴
 *   3  5시간~    zzz. 오늘은 안 돌아온다
 *
 * 접속 쪽 단계와 같은 경계(1·3·5시간)를 쓴다. 두 축이 같은 눈금이면
 * 화면을 볼 때 머릿속에서 한 번만 환산하면 된다.
 */
export function restTier(at: string | null, now: number): 0 | 1 | 2 | 3 {
	if (!at) return 3;

	const left = Date.parse(at);
	if (Number.isNaN(left)) return 3;

	const minutes = Math.max(0, (now - left) / 60000);
	if (minutes >= 300) return 3;
	if (minutes >= 180) return 2;
	if (minutes >= 60) return 1;
	return 0;
}
