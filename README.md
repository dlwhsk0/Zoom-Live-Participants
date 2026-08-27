# Zoom Live Participants

Zoom 회의 참가자의 입장/퇴장 이벤트를 수집하고, 이를 웹 화면과 Slack 알림으로 확인할 수 있게 만드는 프로젝트다.

Zoom Event Subscription webhook을 받아 다음 운영 흐름을 지원하는 것이 목표다.

- 참가자 입장/퇴장 이벤트 수집
- 메인 회의실 / 소회의실 관련 이벤트 구분
- 브라우저 기반 이벤트 모니터링
- Slack 알림 전송
- 잘못 전송된 봇 메시지 삭제용 관리 API

## 현재 상태: v2 재작성 중

v1(로컬 Node ESM 서버 + NDJSON 파일 저장)은 동작하는 수준까지 구현했고,
지금은 배포/운영 기준의 v2 구조로 **처음부터 다시 만드는 중**이다.

| | v1 (종료) | v2 (진행 중) |
|---|---|---|
| 런타임 | Node ESM 단일 서버 | TypeScript + Vercel Functions |
| 저장소 | `logs/*.ndjson` 파일 | Supabase PostgreSQL + Drizzle |
| 화면 | 문자열 템플릿 HTML | Vite + React + TanStack Query |
| 구조 | 단일 레포 | pnpm workspace (`apps/api`, `apps/web`) |

v1 코드 전체는 **`snapshot/v1-esm` 브랜치**에 보존되어 있다.
`main`에서는 제거했으므로, v1 구현을 참조할 일이 있으면 그 브랜치를 보면 된다.

### 지금 있는 것

- `apps/api/src/db/schema.ts` — Drizzle 스키마 초안 (4테이블)
- `apps/api/test/fixtures/webhook-events.ndjson` — 실측 webhook 이벤트 162건 (익명화됨)
- `docs/` — 마이그레이션 기준서, 배포 세팅 가이드, 이벤트 분류 기준

### 아직 없는 것

- `apps/web` (프론트엔드)
- Vercel 함수 엔트리포인트 / webhook 수신 경로
- DB 마이그레이션 파일, drizzle 설정, TS 툴체인

## 다음 작업 순서

1. `dedupe_key` 생성 규칙과 `occurred_at` 컬럼 확정 → 스키마 반영
2. `apps/api` 툴체인 세팅 (pnpm install, drizzle-orm/kit, tsconfig)
3. 첫 마이그레이션 생성 및 Supabase 적용
4. webhook 핸들러 TS 포팅 (raw insert → participant_events → slack_deliveries)
5. Vercel 배포 + Zoom endpoint URL 교체

## 문서

- [`docs/migration-baseline.md`](docs/migration-baseline.md) — 마이그레이션 범위, 테이블 스키마, 저장소 선택 근거
- [`docs/setup-vercel-supabase.md`](docs/setup-vercel-supabase.md) — Vercel + Supabase 무료 플랜 세팅 가이드
- [`docs/participant-event-classification.md`](docs/participant-event-classification.md) — 실측 `leave_reason` 5종과 `room_scope` 분류 규칙
- [`docs/README.md`](docs/README.md) — 문서 운영 방식

## 추후 추가될 예정 기능

### Admin

- 슬랙 메시지 템플릿 CRUD
- 봇 메시지 삭제 고도화
- 입퇴장 기록 누락 방지 (채팅 이벤트 체킹 기반 보완)
- 회의 시작/종료 시 Slack 메시지 전송

### 장기 확장 기능

현재는 실현 계획이 없고, 운영 범위가 커질 때 다시 검토할 항목이다.

- 관리 대상 회의가 여러 개인 경우를 위한 회의 정보 엔티티/테이블
- 참가 통계
