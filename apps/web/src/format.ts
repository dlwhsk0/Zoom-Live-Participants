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
