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

초기 기준 테이블 후보:

1. `zoom_raw_webhook_events`
2. `participant_events`
3. `slack_deliveries`
4. `participant_sessions` (선택, 2차)

## 진행 방식

- 큰 덩어리를 한 번에 끝내지 않는다.
- 단계별로 작업하고, 각 단계 끝에서 확인받고 다음 단계로 간다.
- 문서는 단계별 산출물 누적보다, 현재 정답 기준서를 지속 수정하는 방식으로 관리한다.

## 다음 단계 (Step 2 제안)

테이블/엔티티를 확정한다.

- 테이블별 컬럼
- 키/인덱스
- 멱등성(dedupe) 기준
- room_scope 분류값과 저장 규칙
