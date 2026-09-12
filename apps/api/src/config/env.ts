import { z } from "zod";

/**
 * 환경변수 검증.
 *
 * 값이 없으면 기동 시점에 실패시킨다.
 * 특히 ZOOM_WEBHOOK_SECRET_TOKEN 이 없으면 서명 검증을 할 수 없는데,
 * v1은 이 경우 검증을 통과시켜서 인증 없는 공개 엔드포인트가 되었다.
 */
/** 쉼표 구분과 JSON 배열을 모두 받아 오리진 목록으로 만든다. */
export function parseOriginList(raw: string): string[] {
	const trimmed = raw.trim();
	if (!trimmed) return [];

	if (trimmed.startsWith("[")) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed
					.filter((item): item is string => typeof item === "string")
					.map((item) => item.trim().replace(/\/+$/, ""))
					.filter(Boolean);
			}
		} catch {
			// JSON 이 아니면 쉼표 구분으로 처리한다
		}
	}

	return trimmed
		.split(",")
		.map((origin) => origin.trim().replace(/^["'\[\]]+|["'\[\]]+$/g, ""))
		// 끝의 슬래시는 Origin 헤더에 없으므로 떼어낸다
		.map((origin) => origin.replace(/\/+$/, ""))
		.filter(Boolean);
}

const schema = z.object({
	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
	ZOOM_WEBHOOK_SECRET_TOKEN: z
		.string()
		.min(1, "ZOOM_WEBHOOK_SECRET_TOKEN is required"),
	/** 기본 조회 대상 회의방. 조회 API 에서 meeting_id 를 생략하면 이 값을 쓴다. */
	ZOOM_MEETING_ID: z.string().optional(),
	/** 서버 포트. */
	PORT: z.coerce.number().int().positive().default(3000),
	/**
	 * 메트릭 전용 포트. 서비스 포트와 분리한다.
	 * 이 포트를 도메인에 연결하지 않으면 /metrics 는 외부에 노출되지 않는다.
	 */
	METRICS_PORT: z.coerce.number().int().positive().default(9091),
	/** 설정하면 /metrics 에 Bearer 토큰 또는 ?token= 을 추가로 요구한다. */
	METRICS_TOKEN: z.string().default(""),
	/**
	 * 로그 조회 토큰.
	 * 로그에는 참가자 이름과 IP 가 그대로 들어 있어 공개하면 안 된다.
	 * 비워두면 로그 API 자체를 막는다(실수로 열리는 것보다 안 열리는 게 낫다).
	 */
	LOGS_TOKEN: z.string().default(""),
	/**
	 * CORS 허용 오리진 목록.
	 *
	 * 세 가지 표기를 모두 받는다.
	 *   https://a.com
	 *   https://a.com,https://b.com
	 *   ["https://a.com", "https://b.com"]
	 *
	 * 환경변수는 결국 문자열이라 JSON 배열도 문자열로 들어온다.
	 * 어느 쪽으로 적어도 동작하게 해서 표기 때문에 막히지 않도록 한다.
	 *
	 * 비우면 모두 허용 — 로컬 개발용이며 운영에서는 반드시 지정한다.
	 */
	/**
	 * 공개 조회 API 의 공유 토큰.
	 *
	 * 설정하면 /api/participants 와 상태 메시지 쓰기에 x-access-token 을
	 * 요구한다. 비워두면 검사하지 않는다 — 상세는 http/access.ts 주석.
	 */
	ACCESS_TOKEN: z
		.string()
		.default("")
		// HTTP 헤더는 Latin-1 만 담는다. 한글 토큰을 넣으면 브라우저가 아예
		// 보내지 못해 화면이 조용히 401 로 죽는다. 기동할 때 잡는 편이 낫다.
		.refine((v) => /^[\x21-\x7e]*$/.test(v), {
			message: "ACCESS_TOKEN 은 공백 없는 ASCII 여야 합니다 (HTTP 헤더 제약)",
		}),
	/**
	 * 세션 쿠키 서명 키.
	 *
	 * 비워두면 로그인 기능 자체가 꺼진다. 서명 없는 세션을 발급하느니
	 * 로그인을 막는 쪽이 낫다. 바꾸면 발급된 세션이 전부 끊긴다.
	 */
	SESSION_SECRET: z.string().default(""),
	CORS_ALLOWED_ORIGINS: z
		.string()
		.default("")
		.transform(parseOriginList),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
	if (cached) return cached;

	const parsed = schema.safeParse(process.env);

	if (!parsed.success) {
		const detail = parsed.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join(", ");
		throw new Error(`Invalid environment: ${detail}`);
	}

	cached = parsed.data;
	return cached;
}
