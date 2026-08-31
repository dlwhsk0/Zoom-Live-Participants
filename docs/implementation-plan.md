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

**화면 1개.** 회의 세션의 참가자 목록. 그게 전부다.

접속 중인 사람과 나간 사람을 나눠서 보여준다.
한 번 들어온 사람은 **회의가 끝날 때까지 기록으로 남는다.**
나갔다고 목록에서 사라지면 "왔었는지" 자체를 알 수 없게 된다.

끊겼다 다시 들어온 사람은 **한 명으로 합쳐서** 보여준다.
`participant_uuid` 가 접속마다 새로 발급되기 때문에 DB 에는 여러 행으로 남지만,
화면에는 한 줄로 나오고 경과 시간도 최초 입장부터 이어진다.
합치는 기준은 `docs/plan.md` 3장 참고.

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
┌────────────────────────┐
│  접속 중                │
│  2명                    │   ← 숫자를 크게
│  3초 전 기준             │
├────────────────────────┤
│ ● 온라인            2명  │   ← 구역 제목
├────────────────────────┤
│  조하나       1시간 12분 │
│  김동현             4분  │
├────────────────────────┤
│ ○ 오프라인          1명  │   ← 구역 제목
├────────────────────────┤
│  박철수      12분 전 퇴장 │   ← 흐리게
├────────────────────────┤
│  이 회의에 지금까지       │
│  3명이 참여했습니다       │
└────────────────────────┘
```

- 헤더: **접속 중인** 인원수를 가장 크게. 그 아래 마지막 갱신 시각
- **온라인 / 오프라인 두 구역**으로 나눈다. 온라인이 위다.
  각 구역 제목에 점 표시와 인원수를 붙이고, 스크롤 시 상단에 고정된다
- 온라인: 이름 + 최초 입장부터의 경과 시간.
  소회의실을 오가도 리셋되지 않는다 (`first_joined_at` 기준)
- 오프라인: 이름 + "N분 전 퇴장". 흐린 색으로 구분
- 맨 아래: 세션 누적 참여 인원
- 온라인이 비어도 구역은 남고 "접속 중인 사람이 없습니다" 를 보여준다.
  오프라인이 비면 구역 자체를 그리지 않는다
- 맨 위에 세션 누적 참여 인원과 테마 토글을 둔다

### 테마

라이트 / 다크 / 시스템 세 가지를 순환한다. 선택은 `localStorage` 에 남는다.

색은 전부 CSS 변수로만 쓴다. 기본이 라이트이고,
시스템이 다크면 `prefers-color-scheme` 으로 덮고,
`data-theme` 속성이 있으면 그게 최종적으로 이긴다.

### 상태 메시지

참가자 이름 옆에 한 줄짜리 상태 메시지를 둔다. 60자까지.

**권한을 두지 않는다.** 누구나 누구의 것이든 바꿀 수 있다.
대신 수정 전에 확인 창을 한 번 띄운다("본인입니까?").
한 번 확인하면 그 페이지가 열려 있는 동안은 다시 묻지 않는다.

`window.confirm` 대신 테마를 따르는 자체 확인 창을 쓴다.
브라우저 기본 창은 다크 모드에서 튄다.

**IP 로 본인을 추정해 확인창을 건너뛴다.**
요청한 브라우저의 IP 가 참가자의 Zoom 접속 IP 와 같으면 그 사람으로 본다.
`participants` 행에 `public_ip` 가 이미 있고, 재접속해도 유지되는 것이 실측으로 확인됐다.

권한이 아니라 **힌트**다. 이유가 두 가지 있다.

- 같은 네트워크를 여러 명이 쓴다. fixture 47명 기준 IP 49개 중 3개를 여러 명이 공유했고
  한 IP 를 3명이 쓴 경우도 있었다. 그 안에서는 서로를 구분할 수 없다.
- **화면은 폰으로 보고 Zoom 은 노트북으로 하는 경우가 흔하다.** IP 가 다르다.
  일치를 조건으로 걸면 본인이 자기 상태를 못 고친다.

그래서 이렇게 동작한다.

| 상황 | 결과 |
|---|---|
| IP 가 정확히 한 명과 일치 | 이름 옆에 "나" 표시, 확인창 없이 수정 |
| 같은 IP 를 여러 명이 사용 | 아무에게도 표시하지 않음. 확인창 유지 |
| 일치 없음 / 헤더 없음 | 확인창 유지 |

`X-Forwarded-For` 는 위조할 수 있다. 그래서 권한 판단에 쓰지 않는다.
틀려도 확인창이 한 번 더 뜨는 것 이상의 일은 일어나지 않는다.
**IP 자체는 응답에 넣지 않는다.** 일치 여부(`isYou`)만 내보낸다.

저장 위치가 중요하다. `participant_uuid` 는 접속마다 새로 발급되므로
거기에만 붙이면 **재접속할 때마다 상태가 사라진다.**
`participants` 행에 `status_message` 와 `status_updated_at` 을 두고,
조회 시 합칠 때 `status_updated_at` 이 가장 최근인 값을 고른다.
재접속해도 이어진다.

`PUT /api/participants/:participantUuid/status` 로 저장한다.
빈 문자열은 지우기로 본다.
- 통신 실패 시: 직전 목록을 유지하고 상단에 "연결 끊김" 표시.
  화면을 비우지 않는다 — 잠깐의 네트워크 오류로 목록이 사라지면 오해를 부른다

### 안 하는 것

- 소회의실 위치 표시 (판정에 쓰지 않기로 했고, 애초에 알 수 없다)
- 입퇴장 이력 전체(누가 언제 몇 번 드나들었는지), 통계, 검색, 정렬 옵션
- 다크모드, 애니메이션

**완료 기준:** 폰 브라우저에서 열어두면 사람이 들어오고 나갈 때마다 목록이 바뀐다.

### 스터디콘 — 누적 접속 시간에 따른 아이콘

열품타의 스터디콘에서 가져왔다. 목록 대신 그리드로 두고, 이름보다 아이콘이
먼저 읽히게 한다. 같이 있는 사람이 얼마나 붙어 있는지가 한눈에 보여야 한다.

#### 두 축이 같은 눈금(1·3·5시간)을 쓴다

| 접속 중 — 누적 머문 시간 | | 나감 — 나간 지 | |
|---|---|---|---|
| ~30분 | 🧑‍💻 흐리게 | ~1시간 | ☕ |
| 30분~1시간 | 🧑‍💻 또렷하게 | 1~3시간 | 🥱 |
| 1~3시간 | 🧑‍💻 + 노트북 **앞** 오른쪽에 작은 불 | 3~5시간 | 😴 |
| 3~5시간 | 🧑‍💻 + 사람 **뒤**에 큰 불 | 5시간~ | 💤 |
| 5시간~ | 위와 같되 불이 **파랗다** | | |

경계를 양쪽 같게 맞춘 이유는, 화면을 볼 때 머릿속에서 한 번만 환산하면 되기
때문이다. 파란 불은 실제로 온도가 높을수록 불이 파래지는 것을 따른 것이고,
이모지에 색을 입힐 방법이 `hue-rotate` 뿐이라 그렇게 돌린다.

관측된 최고 기록이 4시간 17분이라 5시간 단계는 아직 아무도 닿지 못했다.

#### 누적 시간은 경과 시간이 아니다

여기서 쓰는 값은 **실제로 회의에 머문 구간의 합**이다.
최초 입장부터 흐른 시간(경과)과는 다르다.

```
이주호   경과 4시간 02분   실제 머문 23분    ← 4시간 전에 잠깐 왔다 갔다
라이언   경과 4시간 15분   실제 머문  0분    ← 입장 기록 없이 퇴장만 있음
이정     경과 4시간 06분   실제 머문 4시간 06분
```

전에는 경과를 보여줬는데, 불꽃 단계와 숫자가 서로 다른 것을 가리키게 되어
둘 다 머문 시간으로 통일했다.

#### 계산은 조회 시점에, 정렬은 화면에서

`participant_events` 에서 `joined` 다음 `left` 까지를 한 구간으로 보고 합한다
(`findOnlineSeconds`). 공백은 어느 구간에도 속하지 않으므로 자연히 빠진다.
같은 시각의 `left`+`joined` 쌍(소회의실 이동)은 길이 0 인 구간을 만들고 곧바로
다음 구간이 열리므로 이동 때문에 시간이 끊기지 않는다.

수신 시점에 누적하지 않는 이유는 `mergeReconnections` 와 같다. 더하기는
순서에 의존하므로 지금의 **순서 무관 · 중복 무관** 성질이 깨진다.

**진행 중인 구간은 서버 값에 없다.** 한 번도 안 나간 사람은 서버 기준 0초다.
화면이 `lastOccurredAt` 부터 흐른 시간을 더한다(`totalOnlineSeconds`).
그래서 접속 중인 사람의 정렬도 화면에서 한다 — 매 초 값이 달라지기 때문이다.
나간 사람은 서버가 최근 퇴장순으로 정렬해 준다.

## 6-A. 실제 Zoom 회의로 검증 (배포 전)

fixture 는 2026년 4월 데이터다. Zoom 이 그 사이 동작을 바꿨을 수 있으므로,
배포 전에 실제 회의로 한 번 확인한다. 로컬 서버를 터널로 노출하면 된다.

### 1. 로컬 API 를 띄운다

```
cd apps/api && pnpm dev          # localhost:3000
```

### 2. 터널로 외부에 노출한다

```
ngrok http 3000
# 또는
cloudflared tunnel --url http://localhost:3000
```

출력된 https 주소를 쓴다. 웹훅 엔드포인트는 `<주소>/api/webhook` 이다.

### 3. Zoom App 에 등록한다

Zoom Marketplace → 해당 앱 → Feature → Event Subscriptions

- Event notification endpoint URL: `<터널 주소>/api/webhook`
- Validate 를 누르면 Zoom 이 `endpoint.url_validation` 을 보낸다.
  핸들러가 이미 처리하므로 바로 통과해야 한다.
- 구독할 이벤트: `meeting.participant_joined`, `meeting.participant_left`,
  `meeting.started`, `meeting.ended`

`.env` 의 `ZOOM_WEBHOOK_SECRET_TOKEN` 이 이 앱의 Secret Token 과 같아야 한다.
다르면 서명 검증에서 401 로 거부된다.

### 4. 검증 중 열어둘 화면

| 용도 | 주소 | 설명 |
|---|---|---|
| 참가자 화면 | `http://<LAN IP>:5180` | 폰으로 볼 때. `pnpm dev --host` 출력의 Network 주소 |
| 참가자 화면 | `http://localhost:5180` | PC 에서 볼 때 |
| **들어온 요청 원문** | `http://localhost:4040` | **ngrok 인스펙터** |
| DB | `http://localhost:5050` | pgAdmin |

ngrok 인스펙터가 검증의 핵심 도구다.
Zoom 이 보낸 요청의 헤더와 본문 전체를 요청별로 보여주고,
Replay 버튼으로 같은 요청을 다시 보낼 수 있다.
분류가 이상할 때 실제로 어떤 payload 가 왔는지 여기서 확인한다.

프론트를 폰에서 열려면 `--host` 가 필요하다.

```
cd apps/web && API_ORIGIN=http://localhost:3000 npx vite --port 5180 --host
```

### 5. 서버 로그 읽는 법

`pnpm dev` 는 웹훅이 들어올 때마다 두 줄씩 찍는다.

```
17:58:44  [200] participant_joined   조하나        uid=555       at=2026-08-30T08:58:43Z
         puuid=LOG-1  {"ok":true,"applied":"joined"}
17:58:44  [200] participant_joined   조하나        uid=555       at=2026-08-30T08:58:43Z
         puuid=LOG-1  {"ok":true,"duplicate":true}
17:58:44  [401] participant_left  {"ok":false,"reason":"missing signature headers"}
```

봐야 할 것:

| 필드 | 의미 |
|---|---|
| `uid=` | 방을 이동하면 값이 바뀐다. `puuid` 는 그대로다 |
| `at=` | 발생 시각. 방 이동이면 `left` 와 `joined` 의 이 값이 **같다** |
| `reason=` | 실제로 오는 `leave_reason` 문자열. fixture 와 다르면 판정 규칙을 다시 봐야 한다 |
| `applied` / `duplicate` | 반영됐는지, 재전송으로 걸러졌는지 |
| `[401]` | 서명 검증 실패. Secret Token 불일치이거나 Zoom 이 아닌 요청 |

### 6. 회의를 열고 확인한다

`.env` 의 `ZOOM_MEETING_ID` 가 그 회의방 번호여야 조회 API 가 세션을 찾는다.

| 동작 | 기대 |
|---|---|
| 참가자 입장 | 목록에 나타남 |
| 메인 → 소회의실 이동 | **목록에서 사라지지 않음** |
| 소회의실 → 다른 소회의실 | 사라지지 않음 |
| 소회의실에서 바로 종료 | 목록에서 빠짐 |
| 메인에서 퇴장 | 목록에서 빠짐 |
| 회의 종료 | 전원 정리 |

소회의실 이동에서 사람이 사라지지 않는 것이 이 프로젝트의 합격선이다.
v1 이 실패한 지점이다.

화면은 5초 폴링이므로 반영까지 최대 5초 걸린다.

### 7. 자주 걸리는 것

- **터널만 띄우고 API 를 안 띄운 경우.**
  ngrok 은 살아 있어도 3000 포트가 죽어 있으면 Zoom 웹훅이 전부 실패한다.
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` 로 확인한다.
- **ngrok 무료 플랜은 재시작할 때마다 주소가 바뀐다.**
  터널을 다시 띄웠으면 Zoom Event Subscription 의 URL 도 다시 등록해야 한다.
- **등록 URL 끝에 `/api/webhook` 이 빠진 경우.** 404 가 난다.
- **Secret Token 불일치.** 401 과 함께 `signature mismatch` 가 찍힌다.
  `.env` 의 `ZOOM_WEBHOOK_SECRET_TOKEN` 이 그 앱의 Secret Token 과 같아야 한다.
  `ZOOM_WEBHOOK_VERIFICATION_TOKEN` 은 Zoom 이 2025년 6월에 폐기한 옛 방식이라 쓰지 않는다.

### 8. 실제 데이터 확인

pgAdmin 이나 SQL 로 `participant_events` 를 열어
실제 `leave_reason` 값과 발생 시각 쌍이 fixture 와 같은 패턴인지 본다.

```sql
-- 방 이동으로 보이는 쌍: 같은 참가자, 같은 발생 시각의 left + joined
select participant_uuid, occurred_at, count(*), string_agg(event_type, '+' order by event_type)
from participant_events
group by participant_uuid, occurred_at
having count(*) > 1;
```

### 9. 검증 후 정리

```
cd apps/api && pnpm db:reset --yes
```

## 6-B. 배포

**프론트와 백엔드를 분리해서 올린다.**

| | 어디에 | 무엇을 |
|---|---|---|
| 프론트 | Vercel | `apps/web` 정적 빌드 |
| 백엔드 | Dokploy | `apps/api` 도커 컨테이너 |

도메인이 다르므로 CORS 가 필요하다. 백엔드가 `CORS_ALLOWED_ORIGINS` 로 프론트 도메인을 허용한다.

### 프론트 (Vercel)

`vercel.json` 이 설정을 담고 있다.

- `buildCommand`: `pnpm --filter @zoom-live-participants/web build`
- `outputDirectory`: `apps/web/dist`
- `rewrites`: 모든 경로를 `index.html` 로 (SPA)
- `ignoreCommand`: **`apps/web` 이 바뀌지 않은 커밋에서는 빌드를 건너뛴다.**
  백엔드만 고친 커밋으로 프론트가 재배포되지 않는다

환경변수 (Vercel 대시보드 또는 `vercel env add`):

| 키 | 값 |
|---|---|
| `VITE_API_BASE` | 백엔드 주소. 예: `https://api.example.com` |
| `VITE_MEETING_ID` | (선택) 회의방 번호. 비우면 백엔드 기본값 |

**DB 자격증명이나 Zoom 시크릿을 Vercel 에 두지 않는다.** 프론트는 그 값이 필요 없다.

### 백엔드 (Dokploy)

`apps/api/Dockerfile` 로 빌드한다. 빌드 컨텍스트는 **저장소 루트**다.

```
docker build -f apps/api/Dockerfile -t zlp-api .
```

#### Provider (소스)와 Build Type (빌드 방식)은 별개의 설정이다

둘은 택일이 아니다. 소스는 GitHub, 빌드 방식은 Dockerfile 로 **둘 다** 지정한다.

| 설정 | 값 |
|---|---|
| Provider | **Github** (Gitlab/Git 탭이 아니라) |
| Repository / Branch | `Zoom-Live-Participants` / `main` |
| Build Path | `/` |
| Trigger Type | On Push |
| Watch Paths | `apps/api/**`, `pnpm-lock.yaml` |
| Build Type | **Dockerfile** |
| Docker File | `apps/api/Dockerfile` |
| Docker Context Path | `.` |

범용 `Git` 탭은 URL 로 클론만 하므로 자동 배포에 웹훅을 직접 걸어야 한다.
`Github` 탭은 GitHub App 연동이라 웹훅이 자동으로 설정된다.

**Build Path 와 Context 를 루트로 두는 것이 중요하다.**
`apps/api` 로 좁히면 `pnpm-workspace.yaml` 과 `pnpm-lock.yaml` 을 찾지 못해 install 이 실패한다.

Watch Paths 에 `pnpm-lock.yaml` 을 넣는 이유:
`apps/api/**` 만 보면 의존성이 바뀌어도 백엔드가 재배포되지 않는다.
프론트 의존성 변경으로 백엔드가 같이 재배포되는 낭비보다,
백엔드가 낡은 패키지로 도는 쪽이 훨씬 나쁘다.

#### Domain

| 필드 | 값 |
|---|---|
| Host | 배포 도메인 |
| Path | `/` |
| Container Port | **3000** (앱이 실제로 듣는 포트) |
| HTTPS | **켠다** |
| Middlewares | **비운다** |

Container Port 는 컨테이너 안의 포트다.
컨테이너마다 네트워크 네임스페이스가 다르고 Traefik 이 호스트명으로 라우팅하므로,
다른 앱이 같은 번호를 써도 충돌하지 않는다.

HTTPS 는 필수다. **Zoom 은 HTTPS 엔드포인트만 등록을 허용한다.**

#### Middlewares 를 붙이면 안 되는 이유

**rate limit 이나 CrowdSec 류를 이 엔드포인트에 걸면 이벤트가 유실된다.**

Zoom 웹훅은 고르게 오지 않고 몰려서 온다. 실측(참가자 3명):

| 창 | 최대 수신 |
|---|---|
| 1초 | 3건 |
| 2초 | 4건 |

가장 몰린 구간:

```
09:05:38.662  participant_left_breakout_room
09:05:39.597  participant_joined_breakout_room
09:05:39.915  participant_left
09:05:40.246  participant_joined
```

**참가자 한 명이 방을 한 번 옮길 때마다 약 2초 안에 4건이 발생한다.**
호스트가 20명에게 소회의실을 동시에 열면 수 초 안에 수십 건이 몰린다.

rate limit 에 걸리면 Zoom 은 429 를 받고 그 이벤트는 유실된다.
입장/퇴장 쌍 중 한쪽만 유실되면 접속 판정이 그대로 틀어진다.

보호는 미들웨어가 아니라 애플리케이션이 한다.
HMAC 서명 검증이 fail-closed 로 동작해 서명 없는 요청은 401 로 떨어진다.

#### 환경변수

| 키 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✅ | DB 의 **Internal** Connection URL |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | ✅ | 없으면 웹훅을 전부 거부한다 |
| `ZOOM_MEETING_ID` | | 기본 조회 대상 회의방 |
| `CORS_ALLOWED_ORIGINS` | ✅ | 프론트 도메인. 비우면 모두 허용되므로 운영에서는 지정한다 |
| `PORT` | | 기본 3000 |

#### CORS 허용 오리진 표기

`CORS_ALLOWED_ORIGINS` 는 세 가지 표기를 모두 받는다.

```
https://a.com
https://a.com,https://b.com
["https://a.com", "https://b.com"]
```

환경변수는 결국 문자열이라 JSON 배열도 문자열로 들어온다.
어느 쪽으로 적어도 동작하게 해서 표기 때문에 막히지 않도록 했다.

**끝의 슬래시는 자동으로 떼어낸다.** `Origin` 헤더에는 슬래시가 없어서
`https://a.com/` 로 적으면 매칭되지 않는다. 흔한 실수라 파서에서 막는다.

#### DB 연결은 Internal URL 을 쓴다

Dokploy 의 DB 서비스는 두 가지 주소를 준다.

| | 어디서 접근 | 형태 |
|---|---|---|
| **Internal** | Dokploy 네트워크 안 (앱 컨테이너) | 호스트가 **서비스 이름**, 포트는 컨테이너 내부 포트 |
| External | 인터넷 | 서버 IP + 외부 노출 포트. 기본은 닫혀 있다 |

**앱에는 Internal 을 쓴다.** DB 를 인터넷에 노출할 필요가 없고,
같은 호스트 내부 통신이라 왕복이 수 ms 로 떨어진다.

이는 실질적인 차이를 만든다. 원격 DB 로 측정했을 때
웹훅 1건 처리에 0.95~1.96초가 걸렸다(왕복 3회 × 지연).
Zoom 의 3초 응답 요구에 여유가 없었다. 내부 연결이면 이 문제가 사라진다.

주의: **앱에 도메인을 붙여야 Traefik 네트워크에 연결되어 DB 에 닿는다.**
도메인 없이 배포하면 격리된 네트워크에 남는다.

#### 배포가 실제로 반영됐는지 확인하기

`GET /health` 가 실행 중인 소스의 지문을 돌려준다.

```
{ "ok": true, "version": "3bb036cf3dac", "startedAt": "..." }
```

로컬에서 같은 값을 뽑아 비교한다.

```
cd apps/api && pnpm fingerprint
```

**두 값이 같으면 그 서버는 지금 이 코드로 돌고 있는 것이다.**

빌드 인자나 git 에 의존하지 않는다. 컨테이너에 git 이 없고
`.dockerignore` 가 `.git` 을 제외하기 때문이다.
대신 기동 시점에 `src` 아래 `.ts` 파일 내용을 정렬해 해시한다.

이 수단이 필요했던 이유:
도커 레이어 캐시 때문에 **빌드는 성공했는데 옛 소스가 담긴 이미지**가 나온 적이 있었다.
빌드 로그에 `COPY apps/api/src ... CACHED` 로 찍히는데,
그때는 배포가 반영되지 않는다. Clean Cache 를 켜면 해결된다.

#### 로그 화면

`/logs?key=<LOGS_TOKEN>` 으로 입퇴장 이력을 본다.

두 가지 모드가 있다.

- 기본: 시각, 입/퇴장, 이름, 방 이동 여부, `leave_reason`, `user_id`, IP
- **원본** 토글: 항목을 누르면 Zoom 이 보낸 payload 전체가 펼쳐진다

**토큰 없이는 열리지 않는다.** 로그에는 참가자 이름과 공인 IP 가 그대로 담긴다.
`LOGS_TOKEN` 을 설정하지 않으면 API 가 503 을 돌려준다.
실수로 공개되는 것보다 안 열리는 편이 낫다는 판단이다.

페이지네이션은 `occurred_at` 커서를 쓴다.
방 이동 표시는 같은 페이지 안에서 같은 참가자·같은 발생 시각의 반대 이벤트를 찾아 붙인다.

#### 모니터링 (Prometheus)

메트릭을 **서비스 포트와 분리한 별도 포트**의 `/metrics` 로 노출한다.

Traefik 은 도메인을 하나의 포트로만 라우팅하므로,
메트릭 포트를 도메인에 연결하지 않으면 **외부에서 접근할 수 없다.**
Prometheus 는 도커 네트워크 안에서 `http://<서비스>:9091/metrics` 로 긁는다.

| 환경변수 | 기본 | 설명 |
|---|---|---|
| `METRICS_PORT` | `9091` | 메트릭 전용 포트 |
| `METRICS_TOKEN` | (없음) | 설정하면 Bearer 헤더나 `?token=` 을 추가로 요구 |

수집하는 것:

| 메트릭 | 종류 | 왜 보는가 |
|---|---|---|
| `zlp_db_up` | 게이지 | **DB 도달 여부.** 컨테이너는 살아있는데 DB 만 죽는 상황을 잡는다 |
| `zlp_participants_online` | 게이지 | 현재 접속자 수 |
| `zlp_participants_session_total` | 게이지 | 세션 누적 참여 인원 |
| `zlp_webhooks_received_total{event}` | 카운터 | 이벤트 종류별 수신량 |
| `zlp_webhooks_rejected_total{reason}` | 카운터 | 서명 실패 등. 급증하면 설정 문제이거나 외부 스캔 |
| `zlp_webhooks_duplicate_total` | 카운터 | 재전송으로 걸러진 수 |
| `zlp_participant_events_total{event_type}` | 카운터 | 반영한 입퇴장 |
| `zlp_room_moves_total` | 카운터 | **소회의실 이동 판정 수.** v1 이 틀렸던 지점이라 따로 센다 |
| `zlp_status_updates_total{action}` | 카운터 | 상태 메시지 변경/삭제 |
| `zlp_http_requests_total{route,status}` | 카운터 | 경로별 응답 코드 |
| `zlp_webhook_duration_seconds` | 히스토그램 | **Zoom 은 3초 안에 응답을 요구한다.** 경계에 가까워지는지 본다 |
| `zlp_presence_query_duration_seconds` | 히스토그램 | 조회 지연 |
| `process_*`, `nodejs_*` | 기본 | CPU/메모리/이벤트루프 지연 |

설계상 주의한 것:

- 게이지는 스크레이프 시점에 DB 를 읽는다. 게이지 세 개가 각자 치지 않도록
  2초 캐시를 두고, **각 게이지에 `collect()` 를 달아 등록 순서에 무관하게** 했다.
  마지막 게이지에만 갱신을 걸면 앞의 게이지들이 이전 스크레이프 값을 읽는다.
- DB 조회가 실패해도 `zlp_db_up` 만 0 이 되고 **나머지 메트릭은 계속 나간다.**
- `participant_uuid` 를 라벨에 넣지 않는다. 시계열이 참가자 수만큼 늘어난다.
  경로는 `/api/participants/:uuid/status` 로 정규화한다.

#### 헬스체크란 무엇인가

**"이 컨테이너가 지금 요청을 받을 수 있는 상태인가" 를 묻는 신호다.**

컨테이너가 떴다는 것과 서비스할 준비가 됐다는 것은 다르다. Node 가 기동하고
포트를 열기까지 몇 초가 걸리는데, 그 사이에 트래픽을 보내면 실패한다.
헬스체크는 그 구간을 구분해 준다.

##### 어디로 접속하면 200 을 주는가

서버에 두 개가 있다.

| 경로 | 무엇을 보는가 | 응답 |
|---|---|---|
| `GET /health` | 프로세스가 살아 있는가 | `{"ok":true,"version":"…","startedAt":"…"}` |
| `GET /health/db` | DB 까지 닿는가 | `{"ok":true,"db":"reachable"}` |

밖에서 직접 찍어볼 수 있다.

```
curl https://techeerzoom.techeer.cloud-yaho.cloud/health
{"ok":true,"version":"1c7d468e0360","startedAt":"2026-08-30T18:10:17.053Z"}
```

`version` 은 실행 중인 소스의 지문이다. 로컬에서 `pnpm fingerprint` 로 찍은 값과
같으면 배포가 반영된 것이다. 배포 확인은 이 값으로 한다.

##### 도커가 쓰는 것은 도메인이 아니다

`Dockerfile` 의 `HEALTHCHECK` 는 **컨테이너 안에서 자기 자신에게** 요청한다.
도메인이나 Traefik 을 거치지 않는다.

```dockerfile
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1
```

`node -e` 로 fetch 를 돌리다가 busybox `wget` 으로 바꿨다.
5초마다 Node 프로세스를 새로 띄우면 기동 비용이 계속 드는데 wget 은 그렇지 않다.
`node:22-alpine` 에 기본으로 들어 있다.

##### `/health/db` 를 쓰지 않는 이유

헬스체크가 실패하면 도커는 컨테이너를 **재시작**한다.
DB 가 죽었을 때 필요한 건 재시작이 아니라 알림이다. `/health/db` 를 걸면
DB 장애가 그대로 재시작 루프로 번진다.

DB 상태는 `zlp_db_up` 메트릭이 맡는다. 역할을 나눈 것이다.

#### 무중단 배포

기본 설정으로는 배포할 때마다 컨테이너가 교체되며 **그 사이 웹훅이 유실된다.**
실제로 배포 중 참가자 3명의 입장 이벤트를 놓쳤다.

##### 두 가지가 함께 있어야 한다

| | 역할 |
|---|---|
| `HEALTHCHECK` | 새 컨테이너가 준비됐는지 **판단하는 재료** |
| `Order: start-first` | 준비될 때까지 옛 컨테이너를 **안 내리는 규칙** |

헬스체크만 있고 순서가 기본값(`stop-first`)이면 옛 컨테이너를 먼저 내리므로
그대로 끊긴다. 무중단을 만드는 것은 `start-first` 쪽이다.

Dokploy 의 **Advanced → Cluster Settings → Update Config** 에 넣는다.

```json
{
  "Parallelism": 1,
  "Delay": 10000000000,
  "FailureAction": "rollback",
  "Order": "start-first"
}
```

- **`start-first`** 가 핵심이다. 새 컨테이너가 헬스체크를 통과한 뒤에 옛 것을 내린다
- Dockerfile 의 `HEALTHCHECK` 가 이때 판단 근거가 된다
- `FailureAction: rollback` 은 새 버전이 뜨지 못하면 자동으로 되돌린다

전환 중 잠깐 컨테이너가 둘이 된다. `dedupe_key` 로 중복이 걸러지고
상태를 전부 DB 에 두었기 때문에 안전하다.

Swarm Settings 는 JSON 이 아니라 폼이다.
칸에 보이는 값이 placeholder 일 수 있으니 **직접 입력해야 저장된다.**

##### 푸시로 배포하면 무중단, Deploy 버튼을 누르면 아니다

같은 코드인데 경로가 다르다. 이것이 이 문서에서 가장 중요한 한 가지다.

```
푸시 → 자동 배포                          Deploy 버튼
  1. 빌드      (옛 컨테이너 서비스 중)      1. 컨테이너 정지  ← 여기서 중단
  2. 새 컨테이너 기동                       2. 빌드   (오래 걸림)
  3. 헬스체크 통과 확인                     3. 기동
  4. 트래픽 전환
  5. 옛 컨테이너 정지
```

`Deploy` 는 빌드 **전에** 컨테이너를 내리기 때문에 `start-first` 가 바꿔치기할
대상이 없다. 설정이 잘못된 것이 아니라 롤링 업데이트 경로를 아예 타지 않는다.

**실측 (1초 간격으로 `/health` 측정):**

| 동작 | 끊김 | 표본 |
|---|---|---|
| **푸시 → 자동 배포** | **0초** | 162샘플 전부 200 |
| 푸시 → 자동 배포 (앞선 회차) | 약 1초 | 254샘플 중 1건 실패 |
| Reload | 0초 | 소스를 새로 받지 않는다 |
| Deploy | **129초** | 빌드 전에 컨테이너를 내린다 |

##### 규칙

- **코드를 바꿨으면 푸시만 한다.** 약 2분 뒤 자동으로 무중단 배포된다
- **Deploy 버튼을 누르지 않는다.** 129초 끊긴다
- **Reload 는 환경변수만 바꿨을 때 쓴다.** 소스를 새로 받지 않는다

자동 배포는 푸시 후 기동까지 약 2분 걸린다. 30초 만에 `/health` 를 찍어 보고
"자동 배포가 안 된다" 고 판단한 적이 있는데, 그냥 이르게 본 것이었다.

##### 헬스체크 간격이 교체 속도를 정한다

`interval` 은 그냥 감시 주기가 아니다. `start-first` 가 옛 컨테이너를 내리는
시점을 이 값이 정한다. 새 컨테이너는 헬스체크를 통과해야 healthy 가 되고,
그 전까지는 컨테이너가 둘인 채로 기다린다.

처음엔 `--interval=30s --start-period=10s` 였다. 끊기지는 않지만 준비 신호가
최대 30초 늦게 떠서 교체가 그만큼 길어졌다. 5초로 줄였다.

**로컬에서 이미지를 빌드해 확인한 것:**

```
+2s   starting
+4s   starting
+6s   starting
+8s   healthy      ← 헬스체크 실행 18:17:04, :09, :14 로 5초 간격
```

DB 에 닿지 않는 주소를 주고 띄웠는데도 healthy 가 됐다.
`/health` 는 DB 를 건드리지 않는다는 설계가 실제로 그렇게 동작한다는 뜻이다.
같은 컨테이너에서 `/health/db` 는 503 을 준다.

상세와 다른 대책은 `docs/time-and-gaps.md` 참고.

#### 겪은 사고와 대응

배포하면서 실제로 겪은 것들이다. 같은 곳에서 다시 막히지 않도록 남긴다.

**1. 빌드는 성공하는데 배포가 반영되지 않는다**

빌드 로그에 이렇게 찍히면 옛 소스로 이미지가 만들어진 것이다.

```
#12 [runtime 5/7] COPY apps/api/src apps/api/src   CACHED
```

소스가 바뀌었으면 이 레이어는 캐시될 수 없다. `CACHED` 면 배포는 성공해도 내용은 그대로다.
**General 탭의 `Clean Cache` 를 켜고 다시 배포하면 해결된다.**

정상일 때는 `CACHED` 대신 `DONE` 으로 찍힌다.

**2. 지금 뭐가 떠 있는지 모르겠다**

`GET /health` 의 `version` 과 로컬 `pnpm fingerprint` 를 비교한다.
같으면 그 서버는 지금 이 코드로 돌고 있다. 위 1번을 진단하는 가장 빠른 방법이다.

**3. DB 데이터가 통째로 사라졌다**

Postgres 컨테이너가 재생성되면서 빈 볼륨으로 떴다.
회의 데이터와 스키마가 전부 사라졌고, 백업이 없어 복구하지 못했다.

증상:

```
GET /health      → {"ok":true}                         컨테이너는 정상
GET /health/db   → {"ok":false,"db":"unreachable"}     DB 만 실패
GET /api/…       → 500
```

`/health` 와 `/health/db` 를 나눠 둔 덕분에 원인을 바로 좁힐 수 있었다.
컨테이너 문제인지 DB 문제인지 구분되지 않으면 한참 헤맨다.

진단:

```sql
select pg_postmaster_start_time();   -- 최근이면 재생성된 것
select table_name from information_schema.tables where table_schema = 'public';
```

복구는 마이그레이션 재적용으로 스키마만 되살렸다. **데이터는 복구 못 했다.**

**대응 (반드시 해둘 것):**

- Postgres 서비스에 **영속 볼륨**이 붙어 있는지 확인한다.
  컨테이너를 다시 만들어도 데이터가 남아야 한다.
- Dokploy 의 **Backups** 로 DB 정기 백업을 건다. S3 대상을 설정해두면 된다.
- 볼륨 백업 시 `Container OFF` 를 쓴다. 쓰기 중 백업은 깨질 수 있다.
- **Dokploy 시스템 백업은 도커 볼륨을 담지 않는다.** 프로젝트 설정과 환경변수만 저장된다.
  DB 데이터는 별도로 백업해야 한다.

#### 마이그레이션

컨테이너는 마이그레이션을 자동 실행하지 않는다.
스키마 변경은 배포와 분리해 사람이 확인하고 적용한다.

Dockerfile 이 devDependencies 와 `drizzle/` 를 포함하므로
**컨테이너 안에서 실행할 수 있다.** DB 를 외부에 노출할 필요가 없다.

Dokploy 앱의 Terminal 에서:

```
cd /app/apps/api && npx drizzle-kit migrate
```

컨테이너에 `DATABASE_URL` 이 Internal URL 로 이미 들어 있으므로 그대로 붙는다.

#### 엔드포인트

| 경로 | 용도 |
|---|---|
| `GET /health` | 컨테이너 헬스체크. DB 를 건드리지 않는다. **실행 중인 소스 지문을 함께 준다** |
| `GET /health/db` | DB 연결까지 확인. 배포 직후 점검용 |
| `GET /api/participants` | 참가자 조회 |
| `GET /api/logs` | 입퇴장 로그 조회. **`LOGS_TOKEN` 필요** |
| `POST /api/webhook` | Zoom 웹훅 수신 |

별도 빌드 단계가 없다. Node 22 의 타입 스트리핑으로 `.ts` 를 그대로 실행한다.

`SIGTERM` 을 받으면 진행 중인 요청을 마치고 DB 커넥션을 닫는다.
10초 안에 끝나지 않으면 강제 종료한다.

### 배포 순서

1. **백엔드를 먼저 올린다.** 주소가 정해져야 프론트가 그걸 바라볼 수 있다
   - Domain 을 붙이고 HTTPS 를 켠다 (Traefik 네트워크 연결에도 필요하다)
   - 환경변수를 넣는다. `DATABASE_URL` 은 Internal Connection URL
   - Deploy
2. **마이그레이션을 적용한다.** 컨테이너 Terminal 에서 `npx drizzle-kit migrate`
3. `GET /health/db` 로 DB 연결을 확인한다
4. 프론트의 `VITE_API_BASE` 에 백엔드 주소를 넣고 재배포한다
5. 백엔드의 `CORS_ALLOWED_ORIGINS` 에 프론트 도메인을 넣고 재배포한다
6. Zoom Event Subscription 의 URL 을 `<백엔드 주소>/api/webhook` 으로 바꾼다
7. 실제 회의로 6-A 의 항목을 다시 확인한다

### 커넥션

Dokploy 는 컨테이너가 계속 떠 있으므로 서버리스처럼 커넥션이 폭증하지 않는다.
`postgres.js` 를 `max: 1` 로 쓰고 있어 컨테이너당 커넥션 1개다.
인스턴스를 여러 개로 늘릴 때 `max_connections` 를 다시 본다.

## 로컬 실행

판정 로직만 확인하려면 테스트로 충분하다.

```
pnpm test
```

DB까지 붙이려면 Postgres 를 띄운다.

```
docker compose up -d
```

두 개가 뜬다.

| 서비스 | 주소 | 설명 |
|---|---|---|
| `postgres` | `localhost:55432` | PostgreSQL 16 |
| `pgadmin` | http://localhost:5050 | 브라우저 DB 클라이언트 |

애플리케이션까지 띄우면 아래가 추가된다.

| 용도 | 주소 |
|---|---|
| API | `http://localhost:3000` |
| 프론트 | `http://localhost:5180` |
| ngrok 인스펙터 (터널 사용 시) | `http://localhost:4040` |

Postgres 포트가 5432 가 아닌 것은 로컬에 다른 Postgres 가 있어도 충돌하지 않게 하기 위해서다.
데이터는 named volume 에 있어 컨테이너를 지워도 남는다.

pgAdmin 은 로컬 전용이라 로그인 없이 바로 열린다.
DB 연결은 `docker/pgadmin/servers.json` 으로 미리 등록되어 있어 서버를 직접 추가할 필요가 없다.
비밀번호는 `docker/pgadmin/pgpass` 에서 읽는다.
pgAdmin 컨테이너는 같은 compose 네트워크에 있으므로 호스트명이 `localhost` 가 아니라 `postgres` 다.

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

`apps/api` 스크립트 (전부 저장소 루트의 `.env` 를 읽는다):

| 명령 | 하는 일 |
|---|---|
| `pnpm db:migrate` | 스키마 적용 |
| `pnpm db:check` | 연결과 테이블 확인 |
| `pnpm db:replay` | fixture 162건을 웹훅 경로로 재생하고 DB 결과를 전수 대조 (3단계 완료 기준) |
| `pnpm db:seed` | 화면 확인용 "12명 접속 중" 상태 생성 |
| `pnpm db:reset --yes` | 테이블 내용 삭제. 스키마와 마이그레이션 기록은 유지 |
| `pnpm dev` | API 서버 (api/*.ts 핸들러를 로컬 http 서버로) |

`db:reset` 은 `--yes` 없이 실행하면 현재 행 수만 보여주고 멈춘다.
검증 데이터를 걷어낼 때 쓴다.

프론트는 별도 터미널에서:

```
cd apps/web && API_ORIGIN=http://localhost:3000 pnpm dev
```

폰에서 열려면 `--host` 를 붙인다. 출력되는 Network 주소로 접속한다.

```
cd apps/web && API_ORIGIN=http://localhost:3000 npx vite --port 5180 --host
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
| 6-A | 실제 회의 검증 | 소회의실 이동에서 사람이 사라지지 않음 |
| 6-B | 배포 | 배포 환경에서 같은 결과 |

0~5단계는 로컬 Postgres 로 검증을 마쳤다.
fixture 162건 재생 시 participants 63행이 순수 함수 결과와 완전히 일치하고,
재전송 162건이 전부 중복으로 걸러진다.

1단계를 먼저 하는 이유: 난이도가 전부 판정 규칙에 있고 나머지는 배선이다.
규칙이 fixture로 검증되면 그 뒤는 막히지 않는다.
