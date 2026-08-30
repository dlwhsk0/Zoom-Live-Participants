# 시간 데이터와 수집 공백

시각이 여러 개인 이유, 각각의 역할, 그리고 데이터를 놓쳤을 때 어떻게 되는지 정리한다.

## 시각은 두 종류다

| Zoom 기준 (일어난 시각) | 우리 서버 기준 (받은/쓴 시각) |
|---|---|
| `participant_events.occurred_at` | `webhook_events.received_at` |
| `participants.first_joined_at` | `participant_events.created_at` |
| `participants.last_occurred_at` | `participants.updated_at` |
| | `participants.status_updated_at` |

**판정과 정렬은 왼쪽만 쓴다.** 오른쪽은 감사와 지연 측정용이다.

### 각 컬럼의 역할

| 컬럼 | 출처 | 쓰임 |
|---|---|---|
| `occurred_at` | Zoom `join_time` / `leave_time` | **판정·정렬의 유일한 기준.** 방 이동 쌍도 이 값이 같은지로 판별한다 |
| `first_joined_at` | 최초 `joined` 의 `occurred_at` | 화면의 경과 시간. 재접속해도 `LEAST` 로 유지된다 |
| `last_occurred_at` | 마지막으로 반영된 이벤트의 `occurred_at` | upsert 비교 기준. 이 값보다 늦어야 갱신된다 |
| `created_at` (events) | 서버 시각 | 로그 적재 시각. 지연 측정에 쓴다 |
| `updated_at` | 서버 시각 | 행이 마지막으로 바뀐 시각 |
| `received_at` | 서버 시각 | 원본 수신 시각 |

### 왜 나눠야 하는가 — 실측

같은 이벤트의 두 시각을 비교하면 지연이 보인다.

```
Kevin   left   Zoom 16:29:34  →  DB 16:29:35.969   2.0s
이혜령   left   Zoom 16:27:37  →  DB 16:27:39.193   2.2s
황건하   left   Zoom 16:27:36  →  DB 16:27:37.436   1.4s
```

**지연이 일정하지 않다.** 그래서 도착 순서로 정렬하면 실제 순서와 어긋난다.
fixture 실측에서 방 이동 쌍 40건 중 **17건이 도착 순서가 반대**였다.
`occurred_at` 으로만 정렬해야 하는 이유다.

두 시각을 나눠 둔 덕분에 구분되는 것도 있다.

```
조하나
  last_occurred_at   16:19:07   Zoom 이벤트는 여기서 멈춤
  updated_at         16:23:23   4분 뒤 갱신됨 (상태 메시지 수정)
```

Zoom 때문에 바뀐 것과 사용자가 바꾼 것이 구분된다.

## 수집 공백 — 서버가 꺼져 있으면 어떻게 되는가

### 지금 일어나는 일

Zoom 이벤트를 못 받으면 **그 사람은 존재하지 않는 것과 같다.**
실제로 오늘 배포하며 서버가 여러 번 내려간 동안 참가자 6명 중 **3명이 `first_joined_at` 이 비어 있다.**
나갈 때의 `left` 만 받아서, 왔었다는 건 알지만 언제 왔는지는 모른다.

### 방 이동이 사람을 되찾아 준다 (부분적으로)

놓친 사람이 소회의실로 이동하면 동일 시각의 `left` + `joined` 가 온다.
그 `joined` 가 upsert 로 행을 만들어 **목록에 다시 등장한다.** 별도 처리 없이 기존 규칙만으로 된다.

단 `first_joined_at` 이 **방 이동 시각**이 된다. 실제 입장은 그보다 훨씬 전이다.
2시간 전에 들어온 사람이 "방금"으로 표시된다. 잡히긴 했으나 **틀린 값을 보여준다.**

### Zoom 의 재전송 정책

Zoom 은 응답 코드가 2xx 가 아니면 **최대 3회까지 재시도**한다.
단 **4xx 는 재시도하지 않는다** (인증 실패, 잘못된 요청 등).

우리 구현과 맞물리는 지점:

- 서명 검증 실패는 401 → 재시도 없음. 의도한 대로다
- 내부 오류는 500 → **재시도된다.** DB 가 잠깐 죽어도 복구될 수 있다
- `dedupe_key` 로 중복이 걸러지므로 재전송이 안전하다

또한 웹훅 URL 은 **72시간마다 재검증**되고, 6회 연속 실패하면 **구독이 비활성화**된다.
서버를 오래 내려두면 Zoom 이 아예 안 보내기 시작한다.

## 놓친 데이터를 되찾는 방법 — Report API

실시간 참가자 조회(`/metrics/meetings/...`)는 Business 이상이 필요하다. 이건 못 쓴다.

```
HTTP 400  "This API is only available for ZMP and Business or higher accounts"
```

**그런데 끝난 회의는 Pro 로도 조회된다.** 실제로 확인했다.

```
GET /report/meetings/{meetingUUID}/participants     HTTP 200 ✅
GET /past_meetings/{meetingUUID}/participants       HTTP 200 ✅
GET /past_meetings/{meetingId}/instances            HTTP 200 ✅ (624개 인스턴스)
```

주는 필드:

| 필드 | 채움 | 비고 |
|---|---|---|
| `name` | ✅ | |
| **`user_email`** | ✅ | **웹훅에서는 0% 였던 값** |
| `id`, `user_id` | ✅ | |
| `join_time`, `leave_time`, `duration` | ✅ | |
| `status` | ✅ | |

**의미:**

1. 회의가 끝난 뒤 **놓친 참가자와 정확한 입퇴장 시각을 메꿀 수 있다**
2. `user_email` 이 나온다. 웹훅만으로는 불가능했던 **사람 단위 식별**의 실마리다
3. 과거 회의도 소급 가능하다

**주의:** Report API 도 **접속 단위로 쪼개져 나온다.** 실측에서 한 사람이 4개 레코드로 나왔고,
앞 레코드의 `leave_time` 과 다음 레코드의 `join_time` 이 같았다.
웹훅에서 발견한 것과 같은 패턴이므로 **같은 합치기 규칙을 적용해야 한다.**

## 개선안

우선순위 순으로.

### 1. `participants.created_at` 추가 (작음)

지금은 수집 공백이 있었는지 **사후에 알 방법이 없다.**

```
first_joined_at  13:00   Zoom 기준 입장
created_at       16:32   우리가 처음 인지한 시각
                 ↑ 차이가 크면 그동안 못 받고 있었다는 증거
```

### 2. 입장 시각이 부정확함을 표시 (작음)

`joined` 가 **방 이동 쌍의 일부인데 그 참가자의 이전 기록이 없으면**,
이미 회의에 있었다는 뜻이므로 `first_joined_at` 이 실제보다 늦다.

이 경우 화면에 경과 시간 대신 "접속 시각 불명" 을 보여준다.
**틀린 숫자보다 모른다고 하는 편이 낫다.** 출결 용도라면 특히 그렇다.

### 3. 회의 종료 후 Report API 로 메꾸기 (중간)

`meeting.ended` 를 받으면 그 세션의 참가자 명단을 Report API 로 가져와
빠진 사람을 채우고 `first_joined_at` 을 정확한 값으로 교정한다.

- 웹훅으로 받은 것과 Report 결과를 대조해 차이를 기록하면 **수집 품질을 수치로 볼 수 있다**
- Report 도 접속 단위로 쪼개지므로 합치기 규칙을 재사용한다
- 회의가 끝나야 조회되므로 **실시간 보정은 안 된다.** 사후 정정이다

### 4. `user_email` 로 사람 단위 식별 (큼)

Report API 의 이메일을 저장해두면 날짜를 가로지르는 동일인 식별이 가능해진다.
지금은 `meeting_uuid` 안에서만 사람을 묶을 수 있다.
출결 통계나 누적 참여 시간 같은 기능의 전제 조건이다.

### 5. 세션 테이블 (선택)

`meeting.started` / `meeting.ended` 를 별도 테이블로 관리하면
세션 경계가 명확해지고, 어느 세션에 공백이 있었는지 추적하기 쉬워진다.

## 하지 않기로 한 것

- **실시간 REST 폴링으로 보정하기** — Business 요금제가 필요하다
- **웹훅 유실을 완전히 막기** — 서버가 꺼져 있으면 방법이 없다.
  줄이는 것(재시도, 헬스체크)과 사후 보정(Report API)이 현실적인 대응이다
