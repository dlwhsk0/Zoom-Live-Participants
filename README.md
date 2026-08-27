# Zoom Live Participants

Zoom 회의에 **지금 누가 접속해 있는지**를 실시간으로 보여주는 프로젝트다.

Zoom Event Subscription webhook을 받아 다음 운영 흐름을 지원하는 것이 목표다.

- 참가자 입장/퇴장 웹훅 수집
- 메인 회의실 / 소회의실 이동을 구분한 접속 상태 판정
- 브라우저 기반 실시간 현황 화면

## 현재 상태: v2 재작성 중

v1(로컬 Node ESM 서버 + NDJSON 파일 저장)은 동작하는 수준까지 구현했고,
지금은 배포/운영 기준의 v2 구조로 **처음부터 다시 만드는 중**이다.

| | v1 (종료) | v2 (진행 중) |
|---|---|---|
| 런타임 | Node ESM 단일 서버 | TypeScript + Vercel Functions |
| 저장소 | `logs/*.ndjson` 파일 | PostgreSQL + Drizzle |
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

1. 접속 판정 로직을 순수 함수로 구현하고 fixture로 검증
2. `apps/api` 툴체인 세팅 (pnpm, TypeScript, Drizzle, Zod)
3. 스키마 + 첫 마이그레이션
4. 웹훅 수신 엔드포인트
5. 현재 접속자 조회 API → `apps/web` 화면 → 배포

상세는 [`docs/plan.md`](docs/plan.md).

## 문서

- [`docs/plan.md`](docs/plan.md) — **v2 계획서** (범위, 식별자, 접속 판정 규칙, 데이터 모델)
- [`docs/webhook-data-reference.md`](docs/webhook-data-reference.md) — fixture 실측 수치
- [`docs/README.md`](docs/README.md) — 문서 운영 방식

## 추후 추가될 예정 기능

접속 판정이 정확해진 뒤에 검토할 항목이다. 현재는 계획에 없다.

- 입퇴장 기록 누락 보완
- 관리 대상 회의가 여러 개인 경우를 위한 회의 정보 테이블
- 참가 통계
