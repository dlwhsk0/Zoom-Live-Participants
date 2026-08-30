ALTER TABLE "participants" ADD COLUMN "meeting_started_at" timestamp with time zone;--> statement-breakpoint
-- 기존 행 백필. start_time 은 원본 웹훅 payload 에 그대로 남아 있으므로
-- 컬럼이 생기기 전에 쌓인 세션도 진짜 시작 시각을 되찾을 수 있다.
-- 원본 테이블을 유지해 온 이유가 이런 경우다.
UPDATE "participants" p
SET "meeting_started_at" = w.start_time
FROM (
	SELECT DISTINCT ON (payload->'payload'->'object'->>'uuid')
		payload->'payload'->'object'->>'uuid' AS uuid,
		(payload->'payload'->'object'->>'start_time')::timestamptz AS start_time
	FROM "webhook_events"
	WHERE payload->'payload'->'object'->>'start_time' IS NOT NULL
	ORDER BY 1
) w
WHERE p."meeting_uuid" = w.uuid AND p."meeting_started_at" IS NULL;
