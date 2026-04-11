# Room Entry/Exit Classification

이 문서는 **지금 기준으로 메인 회의실 입퇴장과 소회의실 입퇴장을 어떻게 구분할지**를 정리한다.

이번에 기준을 다시 단순화했다.

핵심은 이거다.

- 기본적으로 입장/퇴장은 메인 회의실 기준으로 본다
- 퇴장만 특별 케이스가 있다
- `leave_reason`에 특정 문구가 있으면 그 퇴장은 **소회의실 입장을 위한 임시 퇴장**으로 본다
- 이후 같은 `participant_uuid`의 다음 입장은 **소회의실 입장**으로 추론한다

즉 지금은 breakout 객체 유무보다 **퇴장 이유 + 이전 기록**이 더 중요하다.

---

## 1. 현재 판정 대상

이 문서의 대상은 아래 두 이벤트다.

- `meeting.participant_joined`
- `meeting.participant_left`

`meeting.started`, `meeting.ended`는 회의 lifecycle 이벤트라서 이 분류 규칙의 대상이 아니다.

---

## 2. 현재 분류값

지금 서버는 참가자 이벤트를 아래 4가지 중 하나로 분류한다.

- `main_join`
- `meeting_left`
- `temporary_breakout_exit`
- `breakout_join_inferred`

이 값은 현재 [`room-context.mjs`](/Users/hana/ZoomAttandance/zoom-live-participants/server/webhook/room-context.mjs#L1) 기준으로 계산된다.

---

## 3. 기본 원칙

### 입장은 기본적으로 메인 회의실 입장이다

특별한 근거가 없으면:

- `meeting.participant_joined`
- `room_scope = main_join`

으로 본다.

### 퇴장은 기본적으로 회의 완전 퇴장이다

특별한 근거가 없으면:

- `meeting.participant_left`
- `room_scope = meeting_left`

으로 본다.

즉 기본값은:

- 입장 = 메인 회의실 입장
- 퇴장 = 회의 완전 퇴장

이다.

---

## 4. 퇴장 규칙

퇴장은 지금 두 종류로 본다.

### 1. 회의 완전 퇴장

조건:

- `meeting.participant_left`
- 그리고 `leave_reason`에 특수 breakout 문구가 없음

결과:

- `room_scope = meeting_left`

의미:

- 이 사용자는 회의에서 완전히 나간 것으로 처리

### 2. 소회의실 입장을 위한 임시 퇴장

조건:

- `meeting.participant_left`
- 그리고 `leave_reason`에 아래 문구가 있음

```text
left the meeting. Reason : left the meeting to join breakout room
```

결과:

- `room_scope = temporary_breakout_exit`

의미:

- 이건 회의 완전 퇴장이 아니라
- **소회의실로 들어가기 위해 잠깐 나간 이벤트**

으로 본다.

이게 지금 규칙에서 제일 중요한 분기점이다.

---

## 5. 입장 규칙

입장은 Zoom webhook이 `소회의실 입장`이라는 명시 키를 직접 주지 않는다고 보고 처리한다.

그래서 입장은 **이전 기록을 보고 추론**해야 한다.

### 1. 기본 입장

조건:

- `meeting.participant_joined`
- 같은 `participant_uuid`의 직전 관련 기록이 특별한 임시 퇴장이 아님

결과:

- `room_scope = main_join`

의미:

- 메인 회의실 입장으로 처리

### 2. 소회의실 입장 추론

조건:

- `meeting.participant_joined`
- 같은 회의 + 같은 `participant_uuid`의 이전 기록 중 가장 가까운 참가자 이벤트가
  - `temporary_breakout_exit`
  인 경우

결과:

- `room_scope = breakout_join_inferred`

의미:

- 이 입장은 **소회의실 입장으로 본다**

지금 구현은 이렇게 해석한다.

- 이전에 같은 `participant_uuid`가
  - `소회의실 입장을 위한 임시 퇴장`
  을 했고
- 그 뒤에 회의 완전 퇴장 기록이 따로 없으면
- 이번 입장은 소회의실 입장으로 본다

실제로는 코드에서 **가장 가까운 이전 참가자 이벤트**를 기준으로 판단하므로,
직전 상태가 임시 퇴장이면 소회의실 입장으로 처리된다고 이해하면 된다.

---

## 6. 판정 흐름 요약

지금 흐름은 이렇게 보면 된다.

### 퇴장

1. `meeting.participant_left`가 옴
2. `leave_reason` 확인
3. `left the meeting to join breakout room`가 있으면
   - `temporary_breakout_exit`
4. 없으면
   - `meeting_left`

### 입장

1. `meeting.participant_joined`가 옴
2. 같은 `participant_uuid`의 직전 참가자 이벤트 확인
3. 직전 이벤트가 `temporary_breakout_exit`면
   - `breakout_join_inferred`
4. 아니면
   - `main_join`

---

## 7. 왜 이렇게 단순화했는가

이렇게 바꾼 이유는 명확하다.

- 기존 `breakout`, `breakout_transition`, `main_or_unknown` 같은 분류는 해석이 너무 많았다
- 운영 기준으로는 퇴장 타입이 더 중요하다
- 실제로 필요한 건
  - 완전 퇴장인지
  - 소회의실로 가기 위한 임시 퇴장인지
  - 그 다음 입장이 소회의실 입장인지
  를 구분하는 것에 더 가깝다

즉 지금 분류는 “소회의실 관련 가능성”이 아니라
**입퇴장 흐름을 운영적으로 해석하기 좋은 구조**로 바뀐 것이다.

---

## 8. 현재 규칙의 한계

그래도 이 규칙이 절대적인 진실은 아니다.

한계는 있다.

- `participant_uuid`가 항상 안정적으로 이어진다는 전제가 필요하다
- Zoom이 소회의실 입장을 명시적으로 주지 않기 때문에 join 쪽은 결국 추론이다
- 일부 예외 케이스에서는 임시 퇴장 후 재입장이 꼭 소회의실 입장만 뜻한다고 100% 단정하기 어렵다

그래도 현재 운영 목적에는 이 규칙이 가장 단순하고 실용적이다.

---

## 9. 현재 기준 한 줄 정리

지금은 이렇게 이해하면 된다.

- 입장은 기본적으로 메인 회의실 입장
- 퇴장은 기본적으로 회의 완전 퇴장
- 다만 `left the meeting to join breakout room`가 있으면 소회의실 입장을 위한 임시 퇴장
- 그 다음 같은 `participant_uuid`의 입장은 소회의실 입장으로 추론
