import { z } from "zod";

/**
 * 환경변수 검증.
 *
 * 값이 없으면 기동 시점에 실패시킨다.
 * 특히 ZOOM_WEBHOOK_SECRET_TOKEN 이 없으면 서명 검증을 할 수 없는데,
 * v1은 이 경우 검증을 통과시켜서 인증 없는 공개 엔드포인트가 되었다.
 */
const schema = z.object({
	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
	ZOOM_WEBHOOK_SECRET_TOKEN: z
		.string()
		.min(1, "ZOOM_WEBHOOK_SECRET_TOKEN is required"),
	/** 기본 조회 대상 회의방. 조회 API 에서 meeting_id 를 생략하면 이 값을 쓴다. */
	ZOOM_MEETING_ID: z.string().optional(),
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
