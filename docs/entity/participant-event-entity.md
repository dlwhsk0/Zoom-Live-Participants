# Participant Event Entity

## 목적

Zoom raw webhook에서 서비스 운영에 실제로 필요한 값만 꺼내 저장하는 도메인 엔티티를 정의한다.

이 문서는 특히 아래 두 가지를 함께 다룬다.

- 참가자 입장/퇴장 이벤트 저장
- 해당 이벤트로 Slack 메시지를 보냈을 때의 channel/ts 저장

## 왜 별도 도메인 엔티티가 필요한가

raw webhook는 보존용이다.

하지만 운영 기능은 raw 기준이 아니라 아래 질문에 답할 수 있어야 한다.

- 누가 입장했는가
- 누가 퇴장했는가
- 메인 회의실인지 소회의실인지
- 이 이벤트로 Slack 메시지를 보냈는가
- 보냈다면 어떤 채널에 어떤 메시지 시각으로 전송됐는가

그래서 raw 엔티티와 별개로 서비스용 이벤트 엔티티가 필요하다.

## 권장 엔티티명

- `participant_event`

## 1차 범위

현재 기준 이 엔티티는 `참가자 입장/퇴장 이벤트` 한 건을 저장하는 용도다.

즉 세션 전체를 묶는 엔티티가 아니라 `이벤트 단위` 저장이다.

세션 매칭은 이후 별도 엔티티로 확장할 수 있다.

## 저장 기준

한 건의 Zoom webhook 이벤트가 들어오면:

1. raw는 `zoom_raw_webhook_event`에 보존
2. 운영용 값은 `participant_event`에 정규화해 저장
3. Slack 전송 성공 시 Slack 메시지 메타데이터를 함께 연결

## 권장 필드 정의

### 기본 식별

- `id`
  - 내부 PK
- `raw_event_id`
  - 원본 raw 이벤트 FK
- `event_name`
  - 예: `meeting.participant_joined`, `meeting.participant_left`
- `event_direction`
  - `join` | `left`

### 회의 식별

- `meeting_id`
- `meeting_uuid`

### 참가자 식별

- `participant_uuid`
  - 현재 가장 우선하는 참가자 키
- `user_name`
- `user_id`
- `participant_id`
  - raw의 `participant.id`, 값이 비어 있을 수 있음
- `participant_user_id`
  - raw의 `participant.participant_user_id`, 값이 비어 있을 수 있음
- `email`
  - 있으면 저장, 없으면 null

### 이벤트 시각

- `event_occurred_at`
  - Zoom payload 안의 join/leave 시각 우선
- `received_at`
  - 서버 수신 시각

### 이벤트 상세

- `leave_reason`
  - left 이벤트일 때 저장
- `room_scope`
  - `main_or_unknown`
  - `breakout`
  - `breakout_left`
  - `breakout_transition`
- `room_detail`
  - 현재 룸 판정 근거 문구

### Slack 전송 정보

- `slack_message_sent`
  - boolean
- `slack_sent_at`
  - Slack 전송 성공 시각
- `slack_channel`
  - Slack channel ID
- `slack_ts`
  - Slack message ts
- `slack_template_key`
  - 어떤 템플릿을 사용했는지 식별할 키
- `slack_message_text`
  - 실제 전송한 최종 문구

### 운영 상태

- `created_at`
- `updated_at`

## 필드 해석 원칙

### 1. 참가자 키

현재 기준 가장 중요한 키는 아래다.

- `meeting_uuid + participant_uuid`

이유:

- 실측 기준 `user_id`는 join/left 사이에서 바뀔 수 있음
- `participant_uuid`가 현재 가장 안정적으로 보임

### 2. 이벤트 시각

이벤트 시각은 두 개를 구분하는 것이 좋다.

- `event_occurred_at`
  - Zoom payload 기준 실제 발생 시각
- `received_at`
  - 서버가 수신한 시각

이 둘을 분리해야 지연과 재전송을 해석할 수 있다.

### 3. Slack 전송 정보

현재 구현에는 Slack message `channel/ts` 저장이 아직 없다.

하지만 이후 메시지 삭제와 추적을 위해 반드시 아래가 필요하다.

- `slack_channel`
- `slack_ts`

이 두 값이 있어야:

- 잘못 간 메시지 삭제
- 어떤 이벤트가 어떤 Slack 메시지로 나갔는지 추적
- 중복 전송 방지

를 할 수 있다.

## 예시 엔티티

```json
{
  "id": "pev_001",
  "raw_event_id": "zrwe_001",
  "event_name": "meeting.participant_left",
  "event_direction": "left",
  "meeting_id": "89791995600",
  "meeting_uuid": "abc-uuid",
  "participant_uuid": "FDDC7C6F-D51D-137B-20AF-64D77D0CE70D",
  "user_name": "홍길동",
  "user_id": "16841728",
  "participant_id": null,
  "participant_user_id": null,
  "email": null,
  "event_occurred_at": "2026-04-11T08:00:00Z",
  "received_at": "2026-04-11T08:00:01Z",
  "leave_reason": "left the meeting. Reason : left the meeting to join breakout room",
  "room_scope": "breakout_left",
  "room_detail": "leave_reason says participant left to join breakout room",
  "slack_message_sent": true,
  "slack_sent_at": "2026-04-11T08:00:02Z",
  "slack_channel": "C1234567890",
  "slack_ts": "1712412345.678900",
  "slack_template_key": "left_18",
  "slack_message_text": "_:melting_face: *홍길동* 님 나가셨습니다. 방금까지 있었던 안정감이 사라졌습니다. :broken_heart: :coffee:_",
  "created_at": "2026-04-11T08:00:01Z",
  "updated_at": "2026-04-11T08:00:02Z"
}
```

## 서브 객체로 분리하는 대안

만약 한 테이블에 Slack 필드를 너무 많이 넣고 싶지 않다면 아래처럼 분리할 수 있다.

- `participant_event`
- `participant_event_slack_delivery`

하지만 현재 단계에서는 단순 운영을 위해 한 엔티티 안에 같이 두는 것도 가능하다.

## 권장 저장 전략

현재 단계 기준 권장 순서는 아래다.

1. `zoom_raw_webhook_event` 저장
2. `participant_event` 생성
3. Slack 전송 시도
4. 성공하면 `slack_message_sent`, `slack_channel`, `slack_ts`, `slack_message_text` 업데이트
5. 실패하면 실패 상태를 따로 저장하거나 null 유지

## 추가로 필요할 수 있는 후속 엔티티

다음 단계에서 유력한 후속 엔티티:

- `participant_session`
  - join/left를 한 세션으로 묶는 엔티티
- `slack_message_template`
  - 템플릿 CRUD용
- `slack_message_delete_log`
  - 삭제 이력 기록용
- `meeting_lifecycle_event`
  - 회의 시작/종료용

## 결론

현재 도메인 엔티티의 핵심은 `participant_event`다.

이 엔티티는 단순 입퇴장 로그를 넘어서 아래를 함께 담아야 한다.

- Zoom 기반 참가자 이벤트 정보
- 회의실 판정 정보
- Slack 전송 결과와 삭제를 위한 message 식별 정보

즉 앞으로의 저장 모델은 `raw 보존 + participant_event 정규화` 2층 구조로 가는 것이 맞다.
