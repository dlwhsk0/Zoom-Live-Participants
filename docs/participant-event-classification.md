# 참가자 이벤트 분류 기준

Zoom webhook의 참가자 입퇴장 이벤트를 `room_scope`로 분류하는 규칙을 정의한다.

이 문서는 추측이 아니라 **실측 데이터 기준**이다. 근거 데이터는
`apps/api/test/fixtures/webhook-events.ndjson` (2026-04-03 ~ 2026-04-11, 162건)이다.

## 왜 분류가 필요한가

Zoom은 소회의실(breakout room) 입퇴장을 별도 이벤트로 보내지 않는다.
소회의실로 이동해도 `meeting.participant_left`가, 돌아와도 `meeting.participant_joined`가 온다.

그대로 두면 소회의실에 잠깐 다녀온 사람이 "퇴장 → 입장"으로 두 번 알림된다.
따라서 **`leave_reason` 문자열을 근거로 완전 퇴장과 일시 이동을 구분**해야 한다.

## 실측 `leave_reason` 분포

162건 중 `meeting.participant_left`는 103건이며, `leave_reason`은 아래 5종이 전부다.

| # | `leave_reason` 값 | 건수 | 의미 |
|---|---|---:|---|
| 1 | `left the meeting. Reason : left the meeting` | 85 | 일반 퇴장 (완전 이탈) |
| 2 | `left the meeting. Reason : left the meeting to join breakout room` | 12 | 메인 → 소회의실 이동 |
| 3 | `got disconnected from the meeting. Reason : Client Close.` | 3 | 네트워크/클라이언트 종료 |
| 4 | `left the meeting. Reason : left the meeting leave breakout room to join main meeting` | 2 | 소회의실 → 메인 복귀 |
| 5 | `left the meeting. Reason : Host ended the meeting.` | 1 | 호스트가 회의 종료 |

주의: 값은 `Reason :` 앞뒤로 접두사가 붙는 형태이므로 **완전 일치가 아니라 부분 일치(`includes`)로 판정**해야 한다.

## `room_scope` 값 정의

| `room_scope` | 판정 조건 |
|---|---|
| `main_join` | `participant_joined` 기본값 |
| `breakout_join_inferred` | `participant_joined`이고, 같은 `participant_uuid`의 직전 참가자 이벤트가 소회의실 이동 퇴장인 경우 |
| `meeting_left` | `participant_left` 기본값 (완전 퇴장) |
| `temporary_breakout_exit` | `participant_left`이고 `leave_reason`이 소회의실 이동인 경우 |
| `meeting_started` | `meeting.started` |
| `meeting_ended` | `meeting.ended` |

`room_scope`와 `event_name`은 DB enum/check로 고정하지 않는다.
값 규칙은 애플리케이션 로직과 이 문서에서 관리한다.

## v1 구현에서 발견된 결함 (v2에서 반드시 반영)

v1 (`snapshot/v1-esm` 브랜치의 `server/webhook/room-context.mjs`)은
`"left the meeting to join breakout room"` **한 가지만** 검사했다.

그 결과 위 표의 **4번(소회의실 → 메인 복귀, 2건)이 매칭되지 않아 `meeting_left`(완전 퇴장)으로 분류**됐다.
메인 회의실로 돌아온 사람에게 "퇴장하셨습니다" 알림이 나가는 상태였다.

v2에서는 아래를 모두 처리한다.

- 2번 → `temporary_breakout_exit` (소회의실로 나감)
- 4번 → 메인 복귀 퇴장. 후속 `joined`가 곧 이어지므로 **알림 대상에서 제외**한다.
- 3번(`Client Close.`) → 현재는 일반 퇴장으로 처리. 재접속이 잦으면 별도 스코프 검토.
- 5번(`Host ended the meeting.`) → `meeting.ended`와 중복 알림이 되지 않도록 억제한다.

## 순서 의존성 주의

`breakout_join_inferred`는 "같은 `participant_uuid`의 **직전** 이벤트"를 봐야 판정된다.
즉 이 분류는 **시간축 정렬에 의존**한다.

따라서 `participant_events`에는 수신 시각(`created_at`)만이 아니라
**이벤트 발생 시각(`occurred_at`, Zoom payload의 `event_ts`)을 반드시 저장**해야 한다.
재처리나 Zoom 재전송으로 insert 순서가 뒤바뀌면 분류가 틀어진다.

## 테스트 fixture

`apps/api/test/fixtures/webhook-events.ndjson`

- 162건, 참가자 47명, 2026-04-03 ~ 2026-04-11 실측
- 위 5종 `leave_reason`을 모두 포함하므로 분류 로직의 회귀 테스트에 그대로 쓸 수 있다
- **개인정보는 익명화되어 있다**: 실명 → `참가자NN`, IP → `203.0.113.x`(RFC 5737 문서용 대역),
  이메일 → 공란, 계정/호스트 ID → `TESTUSERNNN`, 회의 ID/UUID → 더미값
- `participant_uuid`, `user_id`, 타임스탬프, `leave_reason`은 **원본 그대로** 보존했다 (분류 로직이 의존하는 값)
