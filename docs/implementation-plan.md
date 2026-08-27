# 실행 계획 — 백엔드 / 프론트 / DB 연결

`docs/plan.md`가 "무엇을 왜"라면, 이 문서는 "어떤 순서로 어떻게"다.

## 전체 그림

```
Zoom ──webhook──▶ POST /api/webhook ──▶ webhook_events  (원본)
                        │                      │
                        │                      ▼
                        │              participant_events (로그)
                        │                      │
                        │                      ▼
                        └──────────────▶ participants   (사용자 목록)
                                               │
                          GET /api/participants│
                                               ▼
                                    apps/web  (모바일 화면)
                                    5초마다 폴링
```

실시간 푸시(WebSocket/SSE)는 쓰지 않는다.
Vercel Functions는 장시간 연결에 맞지 않고, 5초 폴링이면 체감상 충분하다.

## 0. 툴체인 세팅

지금 `apps/api`는 코드를 실행할 수단이 없다. 이걸 먼저 만든다.

| 항목 | 용도 |
|---|---|
| `pnpm` | 워크스페이스 패키지 관리 |
| `typescript` + `tsconfig.json` | `.ts` 컴파일/타입 검사 |
| `drizzle-orm`, `drizzle-kit` | 스키마 → 마이그레이션 생성/적용 |
| `postgres` | Postgres 드라이버 |
| `zod` | 웹훅 payload 검증 |
| `vitest` | fixture 기반 테스트 |

`apps/api/package.json`의 `check:schema`는 `node --check src/db/schema.ts`인데
Node가 `.ts`를 읽지 못해 실패한다. `tsc --noEmit`으로 교체한다.

**완료 기준:** `pnpm -r typecheck`가 통과한다.

## 1. 판정 로직 (DB 없이)

이 프로젝트의 난이도는 전부 여기 있다. DB도 서버도 없이 순수 함수부터 통과시킨다.

```
apps/api/src/domain/
  presence.ts        판정 규칙
  presence.test.ts   fixture 162건 기반 테스트
```

`presence.ts`가 제공할 것:

- `decideNext(current, incoming)` — 기존 상태와 새 이벤트를 받아 갱신 여부를 반환.
  `plan.md` 4장 규칙 그대로: 발생 시각이 늦거나, 같은 시각이면 `joined`가 이긴다.
- `reducePresence(events)` — 이벤트 배열에서 현재 접속자 목록을 계산.

테스트에서 확인할 것:

| 케이스 | 기대 |
|---|---|
| fixture 정렬순 재생 | 세션별 최대 동시 접속이 실측치와 일치 (가장 큰 세션 12명) |
| 무작위 셔플 200회 | 결과 동일 |
| 완전 역순 | 결과 동일 |
| 중복 3배 | 결과 동일 |
| 소회의실 강종 | 퇴장 처리 |
| 소회의실 간 이동 | 접속 유지 |

**완료 기준:** 위 표가 전부 초록. 이 시점에 DB는 아직 없어도 된다.

## 2. DB 연결

### 호스팅 선택 기준

아직 미정이다. 요구사항은 두 가지다.

- **Connection pooling 필수.** 서버리스 함수는 요청마다 새 인스턴스가 뜬다.
  풀러 없이 붙으면 커넥션이 금방 고갈된다.
- `DATABASE_URL` 하나로 붙을 것.

### 연결 코드

```
apps/api/src/db/
  schema.ts   (완료)
  client.ts   drizzle 인스턴스
```

`client.ts`에서 주의할 점:

- 드라이버는 **prepared statement를 끄고** 쓴다. 풀러(transaction mode)와 충돌한다.
- 연결은 **모듈 스코프에서 1회 생성**해 함수 인스턴스 간 재사용한다.
  핸들러 안에서 매번 만들면 커넥션이 샌다.

### 마이그레이션

```
pnpm --filter api drizzle-kit generate   # SQL 생성
pnpm --filter api drizzle-kit migrate    # 적용
```

**완료 기준:** 빈 DB에 마이그레이션이 적용되고, 테이블 3개와 인덱스가 생성된다.

## 3. 웹훅 수신 엔드포인트

```
apps/api/api/webhook.ts        POST. Zoom이 호출
apps/api/src/webhook/
  signature.ts                 HMAC 검증
  normalize.ts                 payload → 정규화 (zod)
  ingest.ts                    3테이블 쓰기
```

### 처리 순서

1. **서명 검증** — 실패 시 401. `ZOOM_WEBHOOK_SECRET_TOKEN`이 없으면 **거부**한다(fail-closed).
   v1은 토큰이 없으면 통과시켰다. 배포 환경에서 env가 누락되면 인증 없는 공개 엔드포인트가 된다.
   비교는 `timingSafeEqual`을 쓴다.
2. **`endpoint.url_validation`** — Zoom이 엔드포인트 등록 시 보내는 검증 요청. 즉시 응답.
3. **`webhook_events` insert** — `dedupe_key` 충돌이면 이미 처리한 이벤트이므로 200으로 조용히 종료.
4. **`participant_events` insert** — `joined` / `left` 만.
5. **`participants` upsert** — `plan.md` 6장의 `ON CONFLICT` 조건 그대로.
6. **`meeting.ended`** — 해당 `meeting_uuid`의 `participants`를 전부 `is_present = false`로.
   웹훅 누락으로 남아 있는 유령 접속자를 정리하는 지점이다.

응답은 **항상 빠르게 200**을 준다. Zoom은 응답이 늦으면 재전송하는데,
`dedupe_key`가 있어 중복은 안전하지만 불필요한 부하다.

**완료 기준:** fixture 162건을 로컬 서버에 순서대로 밀어 넣었을 때
`participants` 조회 결과가 1단계 테스트와 일치한다.

## 4. 조회 API

```
apps/api/api/participants.ts   GET
```

요청:

```
GET /api/participants?meeting_id=8979...
```

`meeting_id`는 회의방 번호로 **세션이 바뀌어도 고정**이다.
생략하면 `ZOOM_MEETING_ID` 환경변수를 쓴다.

동작: 해당 `meeting_id`에서 `last_occurred_at`이 가장 최근인 `meeting_uuid`(= 현재 세션)를 찾고,
그 세션에서 `is_present = true`인 행을 반환한다.

응답:

```json
{
  "meetingId": "8979...",
  "meetingUuid": "CC/pxpNa...",
  "count": 12,
  "updatedAt": "2026-08-28T05:12:03.000Z",
  "participants": [
    { "id": "FDDC7C6F-...", "name": "조하나", "joinedAt": "2026-08-28T04:01:11.000Z" }
  ]
}
```

`updatedAt`은 이 세션에서 마지막으로 반영된 이벤트 시각이다.
화면에서 "몇 초 전 기준"을 표시하는 데 쓴다.

**완료 기준:** 브라우저에서 이 URL을 열면 접속자 목록 JSON이 나온다.

## 5. 프론트엔드

### 범위

**화면 1개.** 지금 접속 중인 사람 목록. 그게 전부다.

로그인, 라우팅, 상태 관리 라이브러리, 컴포넌트 라이브러리 전부 안 쓴다.

### 구성

```
apps/web/
  index.html
  src/
    main.tsx
    App.tsx           화면 전체
    api.ts            fetch + 타입
```

- Vite + React + TypeScript
- TanStack Query `refetchInterval: 5000` 으로 폴링
- 스타일은 CSS 파일 하나. 프레임워크 없이.

### 화면 (모바일 기준)

세로 한 화면. 폰에서 그대로 읽히는 게 목표다.

```
┌──────────────────────┐
│                      │
│  접속 중              │
│  12명                 │   ← 숫자를 크게
│  3초 전 기준           │
│                      │
├──────────────────────┤
│  조하나               │
│  1시간 12분           │
├──────────────────────┤
│  참가자02             │
│  4분                  │
├──────────────────────┤
│  참가자03             │
│  방금                 │
└──────────────────────┘
```

- 헤더: 접속 인원수를 가장 크게. 그 아래 마지막 갱신 시각
- 목록: 이름 + 접속 경과 시간. 한 줄에 한 명
- 아무도 없으면: "접속 중인 사람이 없습니다"
- 통신 실패 시: 직전 목록을 유지하고 상단에 "연결 끊김" 표시.
  화면을 비우지 않는다 — 잠깐의 네트워크 오류로 목록이 사라지면 오해를 부른다

### 안 하는 것

- 소회의실 위치 표시 (판정에 쓰지 않기로 했고, 애초에 알 수 없다)
- 입퇴장 이력, 통계, 검색, 정렬 옵션
- 다크모드, 애니메이션

**완료 기준:** 폰 브라우저에서 열어두면 사람이 들어오고 나갈 때마다 목록이 바뀐다.

## 6. 배포

1. Vercel 프로젝트 연결 (`apps/api`, `apps/web`)
2. 환경변수 등록 — `DATABASE_URL`, `ZOOM_WEBHOOK_SECRET_TOKEN`, `ZOOM_MEETING_ID`
3. Zoom Event Subscription의 endpoint URL을 배포 주소로 교체
4. 실제 회의를 열어 확인. **소회의실을 실제로 드나들며** 목록이 유지되는지 본다

**완료 기준:** 실제 회의에서 소회의실 이동 시 사람이 사라지지 않는다.
이게 v1이 실패했던 지점이고, 이 프로젝트의 합격선이다.

## 로컬 실행

판정 로직만 확인하려면 테스트로 충분하다.

```
pnpm test
```

DB까지 붙이려면 Postgres 를 띄운다.

```
docker compose up -d
```

`postgres:16-alpine` 이 55432 포트로 뜬다.
5432 를 피한 것은 로컬에 다른 Postgres 가 있어도 충돌하지 않게 하기 위해서다.
데이터는 named volume 에 있어 컨테이너를 지워도 남는다.

`.env` 에 아래를 넣는다.

```
DATABASE_URL=postgresql://dev:devpass@localhost:55432/zoom_live_participants
ZOOM_WEBHOOK_SECRET_TOKEN=<Zoom Event Subscription 의 Secret Token>
ZOOM_MEETING_ID=<회의방 번호>
```

이후:

```
cd apps/api
npx drizzle-kit migrate                                # 스키마 적용 (.env 를 자동으로 읽는다)
node --env-file=../../.env scripts/db-check.mjs        # 연결/테이블 확인
```

검증과 데모용 스크립트:

```
# fixture 162건을 웹훅 경로로 재생하고 DB 결과를 전수 대조한다 (3단계 완료 기준)
node --env-file=../../.env --experimental-strip-types scripts/replay-fixture.ts

# 화면 확인용으로 "12명 접속 중" 상태를 만든다. meeting_id 는 ZOOM_MEETING_ID 를 따른다
node --env-file=../../.env --experimental-strip-types scripts/seed-live.ts

# API 서버 (api/*.ts 핸들러를 로컬 http 서버로 띄운다)
node --env-file=../../.env --experimental-strip-types scripts/dev-server.ts
```

프론트는 별도 터미널에서:

```
cd apps/web && API_ORIGIN=http://localhost:3000 pnpm dev
```

DB 를 비우고 다시 시작하려면:

```
docker compose down -v && docker compose up -d
```

## 순서 요약

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0 | 툴체인 | `typecheck` 통과 |
| 1 | 판정 로직 | fixture 테스트 초록 |
| 2 | DB 연결 | 마이그레이션 적용 |
| 3 | 웹훅 수신 | fixture 재생 결과가 1단계와 일치 |
| 4 | 조회 API | JSON 응답 확인 |
| 5 | 프론트 | 폰에서 목록이 갱신됨 |
| 6 | 배포 | 실제 소회의실 이동에서 유지 |

0~5단계는 로컬 Postgres 로 검증을 마쳤다.
fixture 162건 재생 시 participants 63행이 순수 함수 결과와 완전히 일치하고,
재전송 162건이 전부 중복으로 걸러진다.

1단계를 먼저 하는 이유: 난이도가 전부 판정 규칙에 있고 나머지는 배선이다.
규칙이 fixture로 검증되면 그 뒤는 막히지 않는다.
