/**
 * Prometheus 메트릭. 별도 포트의 /metrics 로 노출한다.
 *
 * 무엇을 재는가:
 *   - 카운터: 웹훅 수신/거부/중복, 참가자 이벤트, 방 이동, 상태 메시지 변경
 *   - 히스토그램: 웹훅 처리 시간 (Zoom 은 3초 안에 응답을 요구한다)
 *   - 게이지: 현재 접속자 수, DB 도달 여부 (스크레이프 시점에 조회)
 *   - 기본: 프로세스 CPU/메모리/이벤트루프 지연 등
 */
import client from "prom-client";

export const register = new client.Registry();
register.setDefaultLabels({ app: "zoom-live-participants-api" });
client.collectDefaultMetrics({ register });

function counter(name: string, help: string, labelNames: string[] = []) {
	return new client.Counter({ name, help, labelNames, registers: [register] });
}

/** 수신한 웹훅. event 는 meeting. 접두사를 뗀 이름이다. */
export const webhooksReceived = counter(
	"zlp_webhooks_received_total",
	"수신한 Zoom 웹훅 수",
	["event"],
);

/** 서명 검증 실패 등으로 거부한 요청. 급증하면 설정 문제이거나 외부 스캔이다. */
export const webhooksRejected = counter(
	"zlp_webhooks_rejected_total",
	"거부한 웹훅 수",
	["reason"],
);

/** dedupe_key 로 걸러낸 재전송. Zoom 은 응답이 늦으면 다시 보낸다. */
export const webhooksDuplicate = counter(
	"zlp_webhooks_duplicate_total",
	"중복으로 걸러낸 웹훅 수",
);

export const participantEventsApplied = counter(
	"zlp_participant_events_total",
	"반영한 참가자 이벤트 수",
	["event_type"],
);

/**
 * 소회의실 이동으로 판정한 건수.
 *
 * 동일 발생 시각의 left + joined 쌍이다.
 * 이 프로젝트가 v1 에서 틀렸던 지점이라 따로 센다.
 */
export const roomMoves = counter(
	"zlp_room_moves_total",
	"소회의실 이동으로 판정한 수",
);

export const statusUpdates = counter(
	"zlp_status_updates_total",
	"상태 메시지 변경 수",
	["action"],
);

export const httpRequests = counter(
	"zlp_http_requests_total",
	"처리한 HTTP 요청 수",
	["route", "status"],
);

/** Zoom 은 3초 안에 응답을 요구한다. 경계에 가까워지는지 본다. */
export const webhookDuration = new client.Histogram({
	name: "zlp_webhook_duration_seconds",
	help: "웹훅 처리 시간",
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5],
	registers: [register],
});

export const presenceQueryDuration = new client.Histogram({
	name: "zlp_presence_query_duration_seconds",
	help: "참가자 조회 시간",
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
	registers: [register],
});

/**
 * 스크레이프 시점에 현재 상태를 읽는 게이지를 등록한다.
 *
 * DB 조회가 실패해도 메트릭 수집 전체가 깨지지 않도록 각각 감싼다.
 * 오늘 DB 볼륨 사고에서 컨테이너는 살아 있는데 DB 만 죽은 상황을 겪었다.
 * zlp_db_up 이 그걸 바로 잡아낸다.
 */
export function registerRuntimeGauges(getters: {
	presence: () => Promise<{ online: number; total: number } | null>;
}): void {
	/**
	 * 한 번의 스크레이프에서 게이지 세 개가 각자 DB 를 치지 않도록 짧게 캐시한다.
	 * 게이지마다 collect() 를 달아 두면 등록 순서에 관계없이 같은 값을 읽는다.
	 * 마지막 게이지에만 갱신을 걸면 앞의 게이지들이 이전 스크레이프 값을 읽는다.
	 */
	const CACHE_MS = 2000;
	let cachedAt = 0;
	let cached: { up: boolean; online: number; total: number } = {
		up: false,
		online: 0,
		total: 0,
	};
	let inFlight: Promise<void> | null = null;

	async function refresh(): Promise<void> {
		if (Date.now() - cachedAt < CACHE_MS) return;
		if (inFlight) return inFlight;

		inFlight = (async () => {
			try {
				const snapshot = await getters.presence();
				cached = {
					up: true,
					online: snapshot?.online ?? 0,
					total: snapshot?.total ?? 0,
				};
			} catch {
				// DB 가 죽어도 나머지 메트릭은 계속 나가야 한다
				cached = { up: false, online: 0, total: 0 };
			} finally {
				cachedAt = Date.now();
				inFlight = null;
			}
		})();

		return inFlight;
	}

	const dbUp = new client.Gauge({
		name: "zlp_db_up",
		help: "DB 도달 가능 여부 (1=정상, 0=실패)",
		registers: [register],
		async collect() {
			await refresh();
			dbUp.set(cached.up ? 1 : 0);
		},
	});

	const online = new client.Gauge({
		name: "zlp_participants_online",
		help: "현재 접속 중인 참가자 수",
		registers: [register],
		async collect() {
			await refresh();
			online.set(cached.online);
		},
	});

	const sessionTotal = new client.Gauge({
		name: "zlp_participants_session_total",
		help: "현재 세션에 한 번이라도 들어온 참가자 수",
		registers: [register],
		async collect() {
			await refresh();
			sessionTotal.set(cached.total);
		},
	});
}
