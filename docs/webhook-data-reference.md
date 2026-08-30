# 웹훅 실측 데이터 레퍼런스

`apps/api/test/fixtures/webhook-events.ndjson`에서 측정한 사실만 기록한다.
판정 규칙과 설계 결정은 `docs/plan.md`에 있다. 이 문서는 그 근거다.

## fixture 개요

| | |
|---|---|
| 기간 | 2026-04-03 ~ 2026-04-11 |
| 전체 이벤트 | 162건 |
| 참가자 이벤트 | 157건 (`joined` 54 / `left` 103) |
| 세션 수 | 4개 (모두 `meeting.ended` 수신) |
| 고유 `participant_uuid` | 63 |
| 고유 표시 이름 | 47 |

## 식별자 실측

| 필드 | 채워짐 | 고유값 |
|---|---:|---:|
| `participant_uuid` | 157/157 | 63 |
| `user_id` | 157/157 | 94 |
| `user_name` | 157/157 | 47 |
| `participant_user_id` | 2/157 | 1 |
| `id` | 2/157 | 1 |
| `email` | 0/157 | 0 |

### `participant_uuid` ↔ `user_id` 관계

하나의 `participant_uuid`에 붙은 `user_id` 개수 분포:

| `user_id` 개수 | `participant_uuid` 수 |
|---:|---:|
| 1 | 36 |
| 2 | 20 |
| 3 | 4 |
| 4 | 2 |
| 7 | 1 |

**방을 이동할 때마다 `user_id`가 새로 발급된다.** `participant_uuid`는 유지된다.

실제 추적 예시 — 한 참가자가 한 세션에서 `user_id` 7개를 받은 기록:

```
18:48:31  LEFT  uid=16838656   left the meeting
18:48:31  JOIN  uid=16844800
18:48:47  JOIN  uid=16845824
18:48:47  LEFT  uid=16844800   left the meeting
18:52:14  LEFT  uid=16845824   left the meeting
18:52:14  JOIN  uid=16846848
...
19:47:56  LEFT  uid=16849920   Host ended the meeting.
```

동일 시각에 `LEFT`와 `JOIN`이 짝을 이루고 `user_id`만 바뀐다.

### 이름 변경 사례

같은 `participant_uuid`가 세션 도중 서로 다른 표시 이름 두 개를 사용한 기록이 있다.
표시 이름을 식별자로 쓸 수 없는 직접 근거다.

## `leave_reason` 분포

`left` 103건 기준. 값은 `Reason :` 접두사가 붙은 형태라 부분 일치로 봐야 한다.

| `leave_reason` | 건수 | 즉시 재입장 | 최종 퇴장 |
|---|---:|---:|---:|
| `left the meeting` | 85 | **26** | 59 |
| `left the meeting to join breakout room` | 12 | 12 | 0 |
| `got disconnected... Client Close.` | 3 | 0 | 3 |
| `leave breakout room to join main meeting` | 2 | 2 | 0 |
| `Host ended the meeting.` | 1 | 0 | 1 |

**핵심:** 평범한 `left the meeting` 85건 중 26건이 실제로는 방 이동이었다.
`leave_reason` 문자열만으로는 방 이동과 퇴장을 구분할 수 없다.

## 재입장 간격 분포

`left` 이후 같은 `participant_uuid`의 `joined`가 오기까지 걸린 시간:

| 간격 | 건수 |
|---|---:|
| **0초 (동시)** | **40** |
| 1~5초 | 0 |
| 6~30초 | 0 |
| 31초~5분 | 0 |
| 5분 초과 | 0 |
| 재입장 없음 | 63 |

**중간값이 없다.** 방 이동은 항상 동일 발생 시각, 진짜 퇴장은 재입장 없음.

## 웹훅 도착 특성

방 이동 쌍 40건 기준:

| | 값 |
|---|---|
| 두 이벤트의 수신 시각 차 | 최소 0.002s / 중앙 0.057s / 최대 1.016s |
| 도착 순서 | `JOIN` 먼저 17건, `LEFT` 먼저 23건 |
| 로그 인덱스 간격 | -3, -1, 1 |

**도착 순서는 보장되지 않는다.** 발생 시각 기준으로 정렬해야 한다.

`event_ts`(발생) 대비 `received_at`(수신) 지연: 최소 -1.1s / 중앙 0.8s / 최대 2.4s
(음수는 Zoom 서버와 로컬 시계 차이)

## v1 구현과의 대조

가장 큰 세션(이벤트 109건)에 두 방식을 적용한 결과:

| | v1 (`leave_reason` 기반) | 발생시각 쌍 기반 |
|---|---:|---:|
| 최대 동시 접속 | 4명 | **12명** |
| 방 이동 인식 | 8/26건 | 26/26건 |
| 오분류 | **18건 (69%)** | 0건 |

오분류 1건당 잘못된 퇴장 판정 1회와 재입장 판정 1회가 발생한다.

## `dedupe_key` 검증

| 후보 | 충돌 |
|---|---|
| `meeting_uuid + participant_uuid + event_type + occurred_at` | 0건 ✅ |
| 위 + `user_id` | 0건 ✅ |
| `event_ts + participant_uuid + event_type` | 0건 ✅ |

157건 전수 기준. `plan.md`는 첫 번째를 채택한다 (재전송 시에도 값이 불변).

## 재접속 시 식별자 거동

`participant_uuid` 는 접속 단위다. 회의를 나갔다 다시 들어오면 새 값이 발급된다.

fixture 에서 **같은 `meeting_uuid` 안의 uuid 전환 = 6건**(= 세션 내 재접속):

| 간격 | 직전 `leave_reason` | `public_ip` |
|---|---|---|
| 9.6초 | left the meeting | 동일 |
| 16.6초 | **Client Close.** | 동일 |
| 28.1초 | left the meeting | 동일 |
| 109.8초 | left the meeting | 동일 |
| 18.2분 | left the meeting | 동일 |
| 32.4분 | left the meeting | 동일 |

실제 회의(2026-08-30)에서도 1건 관측: 8분 36초 후 새 uuid, `public_ip` 와 `private_ip` 모두 동일.

**세션 내 재접속 7건 전부 `public_ip` 가 유지됐다.**

다른 `meeting_uuid` 로의 전환은 간격이 354분 이상이라 세션 내 재접속과 겹치지 않는다.

### `leave_reason` 으로는 끊김을 판별할 수 없다

- 세션 내 재접속 6건 중 `Client Close.` 는 1건뿐. 나머지 5건은 평범한 `left the meeting`
- 반대로 `Client Close.` 3건 중 2건은 재접속하지 않았다

### 식별자 후보별 채움 비율

| 필드 | `joined` | `left` | 비고 |
|---|---|---|---|
| `participant_uuid` | 100% | 100% | 접속 단위 |
| `public_ip` | 100% | 100% | **재접속해도 유지** |
| `user_id` | 100% | 100% | 방 이동마다 바뀜. 한 세션 9개 |
| `user_name` | 100% | 100% | 변경 가능 |
| `private_ip` | **필드 없음** | 100% | `left` 에만 존재 |
| `participant_user_id` | 2% | 1% | 사실상 못 씀 |
| `id` | 2% | 1% | 사실상 못 씀 |
| `email` | **0%** | **0%** | 소회의실 이벤트에서만 일부 |

## 소회의실 전용 이벤트 (fixture 에 없음)

실제 회의에서 확인된, fixture 에 없던 이벤트 2종.

- `meeting.participant_joined_breakout_room`
- `meeting.participant_left_breakout_room` (`leave_reason: "Leave breakout room."`)

현재 구현은 원본만 저장하고 판정에 쓰지 않는다.
**이 이벤트 없이도 판정이 정확하다는 것이 실제 회의에서 확인됐다.**

주의할 점:

- 이 이벤트의 `user_id` 는 형식이 다르다. 예: `"167782402026-08-30 09:00:49:000"`
  (숫자 뒤에 타임스탬프가 붙는다). 일반 `joined`/`left` 의 `user_id` 와 같은 네임스페이스가 아니다.
  대신 `parent_user_id` 가 일반 이벤트의 `user_id` 와 매칭된다.
- `email` 이 채워지기도 하지만 참가자가 아니라 **방 단위** 패턴이다. 신뢰할 수 없다.
- 일반 `left`/`joined` 와 도착 순서가 뒤바뀌기도 한다.

## fixture 익명화

원본에는 실명·이메일·공인 IP가 포함되어 있어 **커밋 전 익명화했다.**

| 필드 | 처리 |
|---|---|
| `user_name` | `참가자NN` (원본 이름과 1:1 매핑) |
| `public_ip` | `203.0.113.x` (RFC 5737 문서용 대역) |
| `email` | 공란 |
| `account_id`, `host_id`, `participant_user_id` | 더미값 |
| `topic` | `테스트 회의실` |
| 회의 ID / UUID | 더미값 |
| `participant_uuid`, `user_id`, 타임스탬프, `leave_reason` | **원본 유지** (판정 로직이 의존) |

원본 로그는 저장소에 두지 않는다.
