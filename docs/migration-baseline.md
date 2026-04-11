# Migration Baseline

## 목적

현재 Node ESM 단일 서버 + NDJSON 기반 구현을,  
배포/운영 기준의 v2 구조로 전환한다.

이번 마이그레이션의 기준 목표는:

- `Vercel 함수 스타일` 백엔드
- `Supabase PostgreSQL` 기반 저장
- `NDJSON 저장 제거`
- 백/프론트 분리 구조

## 스코프(확정)

### Backend

- TypeScript (ESM)
- Vercel Functions
- Zod
- Drizzle
- PostgreSQL (Supabase)

### Frontend

- Vite
- React
- TanStack Query
- Tailwind (선택)

### Workspace

- pnpm workspace
- `apps/api`
- `apps/web`

## 비목표 (현재 단계에서 안 하는 것)

- 운영 통계 대시보드 완성
- 관리자 템플릿 CRUD 완성
- 이벤트 히스토리 무한 보관 정책 확정

## 데이터 저장 기준

파일 저장(`logs/webhook-events.ndjson`)은 종료하고, DB 저장만 사용한다.

현재 1차 기준 테이블:

1. `zoom_raw_webhook_events`
2. `participant_events`
3. `slack_deliveries`
4. `slack_message_templates`

### 공통 원칙

- FK 제약은 우선 사용하지 않는다. (참조 컬럼만 저장)
- 파생 가능한 중복 컬럼은 저장하지 않는다.
- 운영 조회/비즈니스 로직은 `participant_events` 중심으로 진행한다.

### `zoom_raw_webhook_events` (원본 보존)

컬럼:

- `raw_id`
- `received_at`
- `payload_json`
- `dedupe_key` (`unique`)

설명:

- 이 테이블은 원본 보존/재처리 목적이다.
- 멱등성 처리는 `dedupe_key`로 수행한다.

### `participant_events` (서비스 본체)

컬럼:

- `event_id`
- `raw_id` (FK 제약 없이 참조값만 저장)
- `event_name`
  - `meeting.participant_joined`
  - `meeting.participant_left`
  - `meeting.started`
  - `meeting.ended`
- `meeting_uuid`
- `meeting_id`
- `participant_uuid`
- `user_name`
- `leave_reason`
- `room_scope`
  - `main_join`
  - `meeting_left`
  - `temporary_breakout_exit`
  - `breakout_join_inferred`
  - `meeting_started`
  - `meeting_ended`
- `created_at`
- `updated_at`

### `slack_deliveries` (Slack 전송/삭제 이력)

컬럼:

- `message_id`
- `event_id` (FK 제약 없이 참조값만 저장)
- `template_key`
- `status`
  - `queued`
  - `sent`
  - `failed`
  - `deleted`
- `error_message`
- `channel_id`
- `message_ts`
- `sent_at`
- `deleted_at`
- `created_at`
- `updated_at`

참고:

- Slack 전송 방식은 `chat.postMessage` 기준으로 진행한다.
- `message_text`는 저장하지 않는다. (템플릿 키 중심 운영)

### `slack_message_templates` (템플릿 관리)

컬럼:

- `template_id`
- `template_key` (`unique`)
- `event_name`
- `text`
- `is_active`
- `created_at`
- `updated_at`

제외한 컬럼(현재 1차):

- `event_direction` (`event_name`으로 파생 가능)
- `user_id` (안정 식별키가 아니라 1차에서 제외)
- `occurred_at`, `received_at` (`raw` 기준으로 조회)
- `room_detail`, `classification_version` (1차 범위 제외)

2차로 미루는 항목:

- `participant_sessions` 테이블은 1차에서 만들지 않는다.

## 저장소 검토 결과 (Notion MCP vs Supabase)

### 결론

- 운영 데이터의 source of truth는 `Supabase PostgreSQL`로 유지한다.
- Notion은 필요 시 운영 요약/리포트 뷰로만 사용한다. (선택)

### 이 프로젝트에서 DB 기능이 필요한 지점

1. 웹훅 처리 단위 일관성
- Zoom 이벤트 수신 후 `raw 저장 -> participant_events 생성 -> slack_deliveries 생성/업데이트`가 한 흐름으로 이어진다.
- 중간 실패 시 반쪽 데이터가 생기지 않도록 DB 트랜잭션/원자적 처리 패턴이 필요하다.

2. 멱등성 처리
- Zoom 재전송/중복 수신 가능성 때문에 `dedupe_key` 기반 중복 방지가 필요하다.
- DB unique 기반 처리가 가장 단순하고 안정적이다.

3. 조회 모델
- 운영 화면/디버깅/상태 추적은 `participant_events`와 `slack_deliveries`를 함께 조회한다.
- 조인/필터/정렬을 반복적으로 사용하게 된다.

4. 성능
- `meeting_uuid`, `participant_uuid`, `status`, `created_at` 중심 조회가 많아 인덱스 설계가 필요하다.

### Notion 단독 저장 시 제약

- API 레이트리밋(대표적으로 평균 초당 요청 제한)으로 이벤트 burst 구간에 취약할 수 있다.
- 관계형 DB 수준의 제약조건/조인/트랜잭션을 직접 대체하기 어렵다.
- 이벤트 스트림 처리(중복 방지, 상태 전이, 재시도)에는 운영 복잡도가 높아진다.

### 비용 관점 대응

- 사이드 프로젝트 비용 최소화 목표는 유지한다.
- 단, 저장소를 Notion으로 바꾸는 대신 Supabase free tier + 최소 스키마 운영으로 시작한다.
- 필요 시 Notion에는 핵심 요약만 비동기 미러링한다.

참고:

- `room_scope`와 `event_name` 값은 DB enum/check로 고정하지 않는다.
- 값 규칙은 애플리케이션 로직과 문서 규약에서 관리한다.

### 분류 로직 (현재 합의)

- 기본 입장: `main_join`
- 기본 퇴장: `meeting_left`
- `leave_reason`에 `left the meeting to join breakout room`이 있으면 `temporary_breakout_exit`
- 같은 `participant_uuid`의 직전 참가자 이벤트가 임시 퇴장이면 다음 join은 `breakout_join_inferred`

## 진행 방식

- 큰 덩어리를 한 번에 끝내지 않는다.
- 단계별로 작업하고, 각 단계 끝에서 확인받고 다음 단계로 간다.
- 문서는 단계별 산출물 누적보다, 현재 정답 기준서를 지속 수정하는 방식으로 관리한다.

## 다음 단계 (Step 2)

위 스키마를 기준으로 Drizzle 스키마 초안(`apps/api`)을 작성하고, webhook 수신 경로를 DB insert 중심으로 전환한다.
