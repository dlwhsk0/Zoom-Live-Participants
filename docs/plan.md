# v2 계획서 — 실시간 참여자 현황

## 1. 이 프로젝트가 하는 일

**지금 이 회의에 누가 접속해 있는지 보여준다.** 그게 전부다.

v1에서는 알림 전송, 템플릿 CRUD, 관리 API, 출결 통계까지 손을 댔다.
그 결과 정작 핵심인 "접속 여부 판정"이 틀린 채로 남았다.
v2는 이 하나를 정확하게 만드는 데 집중한다.

### 비목표 (이번 버전에서 안 함)

- 외부 알림 연동
- 출결 리포트 / 참가 통계
- 관리자 화면, 템플릿 관리
- 여러 회의 동시 관리

알림류는 **접속 판정이 정확해진 다음에** 검토한다.
판정이 틀린 상태로 알림을 붙이면 오알림만 늘어난다 (근거: 4장).

## 2. 제약 — 왜 웹훅밖에 없는가

Zoom에서 "현재 참여자 목록"을 직접 조회하는 API는 상위 요금제(Business 이상)에서만 열린다.
이 프로젝트 계정은 **Pro**이므로 그 경로를 쓸 수 없다.

따라서 유일한 데이터 소스는 **참가자 입퇴장 웹훅**이다.

- `meeting.participant_joined`
- `meeting.participant_left`
- `meeting.started` / `meeting.ended` (세션 경계)

즉 현재 상태를 **조회하는** 게 아니라, 이벤트 스트림으로부터 **재구성해야** 한다.
이 문서의 나머지는 대부분 "어떻게 정확히 재구성하는가"에 대한 것이다.

## 3. 식별자 — 이름을 쓰면 안 되는 이유

참가자는 표시 이름을 언제든 바꿀 수 있다. 실측 데이터로도 확인된다.

| 후보 | 채워짐 | 고유값 | 판정 |
|---|---:|---:|---|
| `participant_uuid` | 157/157 | 63 | ✅ **채택** |
| `user_id` | 157/157 | 94 | ❌ 방을 옮길 때마다 바뀜 |
| `user_name` | 157/157 | 47 | ❌ 변경 가능, 중복 |
| `participant_user_id` | 2/157 | 1 | ❌ 로그인 계정만 |
| `id` | 2/157 | 1 | ❌ 로그인 계정만 |
| `email` | 0/157 | 0 | ❌ 항상 비어 있음 |

근거:

- `user_name`은 고유값이 47개인데 실제 참가 주체는 63명이다. **이름만으로는 구분이 안 된다.**
- 실제로 같은 `participant_uuid`가 세션 도중 서로 다른 이름 두 개를 사용한 사례가 있다.
- `user_id`는 **방을 이동할 때마다 새로 발급된다.** 한 참가자가 한 세션에서 `user_id` 7개를 받은 사례가 있다.
- `email`, `participant_user_id`는 사실상 항상 비어 있어 쓸 수 없다.

### 결론

**세션 내 참가자 동일성은 `participant_uuid`로 판단한다.**

주의: `participant_uuid`는 **접속(connection) 단위**로 발급된다.

소회의실을 옮겨도 유지되지만, **회의를 나갔다 다시 들어오면 새 값이 발급된다.**
실측에서 세션 내 재접속 7건 전부 새 uuid 를 받았다(간격 9.6초 ~ 32.4분).
따라서 uuid 하나는 "한 번의 접속"이지 "한 사람"이 아니다.

### 같은 사람 묶기

세션 안에서 재접속한 사람을 한 명으로 합치려면 **이름**을 쓰고,
**활동 구간이 겹치면 합치지 않는다.**

| 후보 | 판정 |
|---|---|
| `user_id` | ❌ 방을 옮길 때마다 바뀐다. 한 세션에서 9개 관측 |
| `email` | ❌ `joined`/`left` 에서 0%. 소회의실 이벤트에서만, 그것도 일부 |
| `participant_user_id`, `id` | ❌ 157건 중 1건만 채워짐 |
| `public_ip` | ⚠️ 재접속에는 유지되지만 **네트워크를 옮기면 바뀐다** |

#### `public_ip` 를 키에서 뺀 이유

처음에는 `이름 + public_ip` 였다. 세션 내 재접속 7건에서 IP 가 전부 유지되는 것을
확인했기 때문이다. 하지만 그 실측은 **같은 네트워크 안에서의 재접속**만 담고 있었다.

운영에서 한 사람이 오전에 한 곳, 오후에 다른 곳에서 들어온 사례가 나왔다.

```
119.207.185.51   05:59 ~ 07:54
58.29.75.65      11:20 ~
```

IP 가 달라 두 명으로 쪼개졌고, 누적 접속 시간도 115분과 31분으로 나뉘어
불꽃 단계가 실제보다 낮게 나왔다.

#### 시간 겹침 안전장치도 뺐다

처음에는 "활동 구간이 겹치면 다른 사람" 이라는 조건을 남겨 두었다.
한 사람이 동시에 두 곳에 있을 수 없다는 논리였다.

그런데 **기록상으로는 겹친다.** 재접속할 때 Zoom 이 새 연결의 `joined` 를
먼저 보내고 옛 연결의 `left` 를 나중에 보내기 때문이다.

```
행 A   10:08:20 ~ 12:02:07 (left)
행 B   12:00:36 ~          (joined)
```

91초가 겹쳤고 안전장치가 이를 동명이인으로 오판해 한 사람을 두 명으로 갈랐다.
이런 인수인계 구간을 걸러낼 임계값을 정할 근거가 없어서 조건 자체를 뺐다.

**지금은 이름이 같으면 조건 없이 합친다.**

#### 이렇게 해도 되는 이유

병합은 **조회 시점 계산**이다. 원본 데이터를 바꾸지 않는다.
`webhook_events`(Zoom 원본)와 `participant_events`(정규화 로그)는 그대로 남고,
`participants` 행도 손대지 않는다. 규칙을 바꾸면 결과가 즉시 따라온다.

동명이인이 잘못 묶이면 어드민에서 한쪽 이름을 달리 주어 떼어낸다.
그 편집도 `admin_actions` 에 이전 값과 함께 남아 되돌릴 수 있다.

**대가:** 구간이 실제로 겹치는 두 행을 합치면 누적 접속 시간이 그만큼
이중으로 셈해진다. 위 사례에서는 91초라 무시할 만하다.

합치기는 **조회 시점**에 한다. 수신 경로에서 행을 병합하면
`ON CONFLICT` upsert 가 보장하는 순서 무관·중복 무관 성질이 깨진다.

날짜를 가로지르는 사용자 식별은 여전히 범위 밖이다. `meeting_uuid` 가 다르면 합치지 않는다.

## 4. 접속 판정 규칙 — 이 프로젝트의 핵심

### 문제

정상 플로우는 이렇다.

```
메인 입장 → 소회의실 입장 → 소회의실 퇴장 → 메인 퇴장
```

그런데 Zoom은 **소회의실 이동에도 `participant_left`를 보낸다.**
그대로 믿으면 소회의실에 들어간 사람이 "나갔다"로 처리된다.

### v1의 접근과 그 실패

v1은 `leave_reason` 문자열에 `left the meeting to join breakout room`이 있으면
방 이동으로 판정했다. **이 방법은 대부분의 방 이동을 놓친다.**

실측(가장 큰 세션, 이벤트 109건):

| | 결과 |
|---|---|
| 실제 방 이동 | 26건 |
| 그중 `leave_reason`으로 잡히는 것 | 8건 |
| **놓치는 것** | **18건 (69%)** |
| v1이 집계한 최대 동시 접속 | **4명** |
| 실제 최대 동시 접속 | **12명** |

`leave_reason`이 `left the meeting`(평범한 퇴장 문구)인데도
실제로는 방 이동인 경우가 대부분이었다. 문자열로는 구분이 안 된다.

### 실제 신호: 동일 시각의 LEFT + JOIN 쌍

방을 이동하면 Zoom은 **같은 `participant_uuid`에 대해
동일한 발생 시각으로 `left`와 `joined`를 함께 보낸다.**

실측 분포 — 퇴장 이후 같은 참가자가 다시 들어오기까지 걸린 시간:

| 간격 | 건수 |
|---|---:|
| **0초 (동시)** | **40** |
| 1초 ~ 5분 | **0** |
| 재입장 없음 | 63 |

**중간값이 존재하지 않는다.** 0초 아니면 영영 안 온다.
즉 방 이동과 진짜 퇴장은 깔끔하게 갈린다.

### 채택 규칙

> **참가자별로 발생 시각이 가장 늦은 이벤트를 본다.**
> **시각이 같으면 `joined`가 `left`를 이긴다.**
> 그 이벤트가 `joined`면 접속 중, `left`면 퇴장.

방 이동은 `left`와 `joined`의 발생 시각이 같으므로 `joined`가 이겨 **접속 상태가 유지된다.**
진짜 퇴장은 짝이 되는 `joined`가 없으므로 그대로 퇴장으로 남는다.

이 규칙의 장점:

- **타이머·디바운스가 필요 없다.** 서버리스(Vercel Functions)에서 그대로 동작한다.
- **웹훅 도착 순서에 영향받지 않는다.** 실측상 `joined`가 먼저 온 경우 17건, `left`가 먼저 온 경우 23건으로 순서는 보장되지 않는다. 발생 시각으로 정렬하므로 무관하다.
- 접속 상태를 **따로 저장하지 않는다.** 이벤트만 쌓고 조회 시점에 계산한다. 상태 갱신 실패로 인한 불일치가 원천적으로 없다.

### 검증

fixture 4개 세션 전체에 적용한 결과, 모든 세션이 `meeting.ended` 시점에
접속자 0명으로 수렴했다. 타임라인 재생에서도 방 이동 중 인원이 잘못 감소하지 않았다.

## 5. 예외 처리

### 소회의실에서 바로 종료

`left`만 오고 짝이 되는 `joined`가 없다 → **규칙이 그대로 퇴장으로 처리한다.** 추가 로직 불필요.

### 소회의실 → 다른 소회의실 이동

메인 경유 없이 `left` + `joined`가 동일 시각에 온다 → **규칙이 그대로 접속 유지로 처리한다.**
실측 26건의 방 이동 중 상당수가 이 경우였다.

### 웹훅 누락

| 누락 | 증상 | 대응 |
|---|---|---|
| `left` 누락 | 나간 사람이 계속 접속 중으로 남음 | `meeting.ended` 수신 시 해당 세션 전원 정리. 추가로 마지막 이벤트 이후 일정 시간이 지난 세션은 조회에서 제외 |
| `joined` 누락 | 방 이동이 퇴장으로 보임 | 다음 `joined`가 오면 자연 복구. 별도 처리 없음 |
| 순서 뒤바뀜 | — | 발생 시각 기준 정렬로 흡수됨 |
| 중복 수신 | 같은 이벤트 두 번 | `dedupe_key` unique 제약으로 차단 |

`meeting.ended`를 **세션 종료의 확정 신호**로 삼는 것이 누락 대응의 핵심이다.
실측 4개 세션 모두 `meeting.ended`를 수신했다.

## 6. 데이터 모델

테이블 3개. **사용자 목록 1개 + 로그 2개(원본/정규화)**.

### `participants` — 사용자 목록

회의 세션 단위 참가자와 현재 접속 상태. 화면이 조회하는 테이블이다.

| 컬럼 | 설명 |
|---|---|
| `id` | PK |
| `meeting_uuid` | 회의 세션 |
| `participant_uuid` | 세션 내 참가자 식별자 |
| `display_name` | 마지막으로 관측된 표시 이름 |
| `is_present` | **현재 접속 여부** |
| `last_event_type` | `joined` / `left` |
| `last_occurred_at` | 마지막으로 반영된 이벤트의 발생 시각 |
| `first_joined_at` | 최초 입장 |
| `updated_at` | |

unique: `(meeting_uuid, participant_uuid)`

### `participant_events` — 로그

입퇴장 이벤트를 정규화해 시간순으로 쌓는다.

| 컬럼 | 설명 |
|---|---|
| `id` | PK |
| `webhook_event_id` | 원본 참조 (FK 제약 없음) |
| `meeting_uuid` | |
| `participant_uuid` | |
| `event_type` | `joined` / `left` |
| `occurred_at` | **`join_time` 또는 `leave_time`. 판정의 기준** |
| `display_name` | 표시용. 판정에 쓰지 않음 |
| `user_id` | 방 세션 구분용. 디버깅 참고 |
| `leave_reason` | 원문 보존. 판정에 쓰지 않음 |

인덱스: `(meeting_uuid, participant_uuid, occurred_at)`, `(meeting_uuid, occurred_at)`

### `webhook_events` — 원본 보존

| 컬럼 | 설명 |
|---|---|
| `id` | PK |
| `received_at` | 수신 시각 |
| `payload` | 원본 JSON 전체 |
| `dedupe_key` | unique |

원본을 남기는 이유: **판정 규칙은 바뀐다.**
실제로 v1의 `leave_reason` 기반 분류가 틀린 것으로 확인되어 규칙을 갈아엎었다.
정규화 결과만 있었다면 과거 데이터를 다시 만들 수 없다. 원본이 있으면 재처리로 복구된다.

### `dedupe_key` 규칙 (확정)

```
meeting_uuid | participant_uuid | event_type | occurred_at
```

fixture 157건 전수 적용 결과 **충돌 0건**.
`occurred_at`은 발생 시각이라 Zoom이 재전송해도 값이 같아 멱등성이 보장된다.

### `participants` 갱신 규칙

4장의 판정 규칙을 그대로 upsert 조건으로 쓴다.

```sql
INSERT INTO participants (
  meeting_uuid, participant_uuid, display_name,
  is_present, last_event_type, last_occurred_at, first_joined_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (meeting_uuid, participant_uuid) DO UPDATE SET
  display_name     = EXCLUDED.display_name,
  is_present       = EXCLUDED.is_present,
  last_event_type  = EXCLUDED.last_event_type,
  last_occurred_at = EXCLUDED.last_occurred_at,
  first_joined_at  = LEAST(
                       participants.first_joined_at,
                       EXCLUDED.first_joined_at
                     ),
  updated_at       = now()
WHERE
  -- 더 늦은 이벤트이거나
  EXCLUDED.last_occurred_at > participants.last_occurred_at
  -- 같은 시각이면 joined 가 이긴다 (= 방 이동)
  OR (EXCLUDED.last_occurred_at = participants.last_occurred_at
      AND EXCLUDED.last_event_type = 'joined');
```

이 `WHERE` 조건 덕분에:

- **도착 순서가 뒤바뀌어도 결과가 같다.** 늦게 도착한 과거 이벤트는 조건에 걸려 무시된다.
- **중복 수신되어도 결과가 같다.** 같은 이벤트를 다시 넣어도 상태가 변하지 않는다.
- **방 이동에서 접속이 끊기지 않는다.** 동일 시각의 `left`가 먼저 반영되어도 뒤이은 `joined`가 덮어쓴다.

### 현재 접속자 조회

```sql
SELECT participant_uuid, display_name, first_joined_at
FROM participants
WHERE meeting_uuid = $1 AND is_present
ORDER BY first_joined_at;
```

`participants`가 손상되었다고 판단되면 `participant_events`에서 언제든 재구성할 수 있다.

```sql
SELECT DISTINCT ON (participant_uuid) participant_uuid, event_type, display_name
FROM participant_events
WHERE meeting_uuid = $1
ORDER BY participant_uuid, occurred_at DESC, (event_type = 'joined') DESC;
```

## 7. 구성

| 영역 | 선택 |
|---|---|
| 백엔드 | TypeScript, Vercel Functions |
| 저장소 | PostgreSQL + Drizzle |
| 검증 | Zod |
| 프론트 | Vite + React + TanStack Query |
| 워크스페이스 | pnpm (`apps/api`, `apps/web`) |

PostgreSQL 호스팅은 미정. `DATABASE_URL` 하나로 붙는 구조로 만들어 나중에 정한다.
서버리스에서 붙으므로 connection pooling을 쓸 수 있는 곳이어야 한다.

## 8. 진행 순서

1. **판정 로직을 먼저 만든다.** 순수 함수 + fixture 162건 기반 테스트.
   DB도 서버도 없이 규칙부터 통과시킨다.
2. `apps/api` 툴체인 (pnpm, TypeScript, Drizzle, Zod)
3. 스키마 + 첫 마이그레이션
4. 웹훅 수신 엔드포인트 (서명 검증 → `webhook_events` → `participant_events`)
5. 현재 접속자 조회 API
6. `apps/web` 실시간 화면
7. 배포 및 Zoom endpoint 전환

1번을 먼저 하는 이유: 이 프로젝트의 난이도는 전부 판정 규칙에 있고,
나머지는 배선이다. 규칙이 fixture로 검증되면 그 뒤는 막히지 않는다.

## 9. 보안 (v1에서 넘어온 숙제)

- 서명 검증은 **fail-closed**로 바꾼다. v1은 `ZOOM_WEBHOOK_SECRET_TOKEN`이 없으면 검증을 통과시켰다. 배포 환경에서 env 누락 = 인증 없는 공개 엔드포인트가 된다.
- 서명 비교는 `timingSafeEqual`을 쓴다.
- fixture는 익명화본만 저장소에 둔다. 원본 로그는 커밋하지 않는다.

## 근거 데이터

이 문서의 모든 수치는 `apps/api/test/fixtures/webhook-events.ndjson`
(2026-04-03 ~ 04-11, 4개 세션, 162건, 참가자 이벤트 157건) 실측이다.
상세는 `docs/webhook-data-reference.md`.
