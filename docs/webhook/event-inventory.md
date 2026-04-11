# Webhook Event Inventory

이 문서는 **지금 서버가 어떤 Zoom webhook 이벤트를 받는지**를 정리한다.

기준은 두 가지다.

- Zoom 앱에서 현재 구독 대상으로 잡아둔 이벤트
- 현재 서버 코드가 실제로 처리하고 있는 이벤트

---

## 1. 현재 수집 대상으로 보는 이벤트

지금 기준으로 다루는 이벤트는 아래 4개다.

- `meeting.started`
- `meeting.ended`
- `meeting.participant_joined`
- `meeting.participant_left`

이 4개는 성격이 두 그룹으로 나뉜다.

### 회의 lifecycle 이벤트

- `meeting.started`
- `meeting.ended`

이 둘은 **특정 참가자의 입장/퇴장**이 아니라 **회의 세션 자체의 시작/종료**를 뜻한다.

즉 이 이벤트는:

- 참가자 출입 로그용 핵심 데이터가 아니라
- 회의 상태를 잡기 위한 보조 메타데이터

로 보는 게 맞다.

### 참가자 이벤트

- `meeting.participant_joined`
- `meeting.participant_left`

이 둘이 현재 프로젝트의 핵심이다.

이 이벤트로 확인하려는 것은 아래다.

- 누가 들어왔는가
- 누가 나갔는가
- 이 퇴장이 회의 완전 퇴장인가
- 소회의실 입장을 위한 임시 퇴장인가
- 이 입장이 메인 회의실 입장인가
- 직전 임시 퇴장을 근거로 한 소회의실 입장인가
- 이 이벤트를 Slack으로 보냈는가

---

## 2. 이벤트별 현재 활용 목적

### `meeting.started`

현재 의미:

- 회의 세션이 열렸음을 알리는 이벤트

현재 활용:

- 화면에서 회의 시작 카드로 표시
- 이후 회의 시작 Slack 알림 기능으로 확장 가능
- 참가자 세션 복원 시 보조 힌트로 활용 가능

주의:

- 이 이벤트만으로는 참가자 입장 여부를 알 수 없다.

### `meeting.ended`

현재 의미:

- 회의 세션이 종료됐음을 알리는 이벤트

현재 활용:

- 화면에서 회의 종료 카드로 표시
- 이후 회의 종료 Slack 알림 기능으로 확장 가능
- 세션 마감 처리 보조 힌트로 활용 가능

주의:

- 이 이벤트만으로는 누가 퇴장했는지 알 수 없다.

### `meeting.participant_joined`

현재 의미:

- 특정 참가자가 회의에 들어온 이벤트

현재 활용:

- 입장 이벤트 저장
- Slack 입장 메시지 발송
- 메인 회의실 입장 / 소회의실 입장 추론 판정

현재 raw에서 중요하게 보는 값:

- `payload.object.id`
- `payload.object.uuid`
- `payload.object.participant.user_name`
- `payload.object.participant.user_id`
- `payload.object.participant.participant_uuid`
- `payload.object.participant.join_time`

### `meeting.participant_left`

현재 의미:

- 특정 참가자가 회의에서 나간 이벤트

현재 활용:

- 퇴장 이벤트 저장
- Slack 퇴장 메시지 발송
- 회의 완전 퇴장 / 소회의실 입장을 위한 임시 퇴장 판정

현재 raw에서 중요하게 보는 값:

- `payload.object.id`
- `payload.object.uuid`
- `payload.object.participant.user_name`
- `payload.object.participant.user_id`
- `payload.object.participant.participant_uuid`
- `payload.object.participant.leave_time`
- `payload.object.participant.leave_reason`

---

## 3. 현재 서버가 이벤트를 어떻게 다루는가

현재 서버 흐름은 대략 아래 순서다.

1. `/webhook`으로 Zoom 이벤트 수신
2. 서명 검증
3. endpoint validation이면 바로 응답
4. 일반 이벤트면 로그 엔트리 생성
5. `logs/webhook-events.ndjson`에 저장
6. `/events`, `/events.json`에서 조회 가능
7. 참가자 이벤트면 Slack 알림 대상 여부 확인 후 전송

즉 지금 기준에서 **운영상 실제 핵심은 participant 이벤트**고, `started/ended`는 상태 이벤트라고 보면 된다.

---

## 4. 현재 문서/코드 기준 해석 요약

정리하면 이렇다.

- `meeting.started`, `meeting.ended`
  - 회의 상태 이벤트
  - 참가자 출입 로그와는 분리해서 봐야 함
- `meeting.participant_joined`, `meeting.participant_left`
  - 실제 출입 로그의 본체
  - Slack 연동도 이 두 이벤트 기준

즉 앞으로 DB 저장을 설계할 때도:

- 회의 lifecycle 이벤트 엔티티
- 참가자 이벤트 엔티티

를 분리해서 보는 게 맞다.
