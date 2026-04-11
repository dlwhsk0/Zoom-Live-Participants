# Zoom Raw Webhook Entity

## 목적

이 문서는 **Zoom이 webhook으로 실제로 보내는 원본 엔티티**를 먼저 정의한다.

중요한 기준은 이거다.

- 먼저 Zoom 원본 body를 정의
- 그 다음에 서버가 덧붙인 필드를 별도로 분리

즉 이 문서의 1순위는 `줌에서 오는 내용 자체`를 정리하는 것이다.

## 1. Zoom이 실제로 보내는 raw body

현재 실측 기준으로 `meeting.participant_joined` 이벤트는 아래 형태로 들어온다.

```json
{
  "payload": {
    "account_id": "ACCOUNT_ID_EXAMPLE",
    "object": {
      "uuid": "MEETING_UUID_EXAMPLE",
      "participant": {
        "public_ip": "203.0.113.10",
        "user_id": "USER_ID_EXAMPLE",
        "user_name": "홍길동",
        "participant_user_id": "",
        "id": "",
        "join_time": "2026-04-11T08:45:45Z",
        "email": "",
        "participant_uuid": "PARTICIPANT_UUID_EXAMPLE"
      },
      "id": "MEETING_ID_EXAMPLE",
      "type": 3,
      "topic": "회의 제목 예시",
      "host_id": "HOST_ID_EXAMPLE",
      "duration": 60,
      "start_time": "2026-04-11T06:33:13Z",
      "timezone": "America/Los_Angeles"
    }
  },
  "event_ts": 1775897147153,
  "event": "meeting.participant_joined"
}
```

즉 raw body의 최상위 구조는 아래 3개다.

- `payload`
- `event_ts`
- `event`

## 2. Zoom raw body 기준 엔티티 정의

### 엔티티명

- `zoom_raw_webhook_event`

이 이름은 **원본 Zoom body 자체**를 뜻한다.

## 3. 최상위 필드

### `event`

예:

- `meeting.participant_joined`
- `meeting.participant_left`
- `meeting.started`
- `meeting.ended`

설명:

- 어떤 종류의 Zoom 이벤트인지 나타낸다.

### `event_ts`

예:

- `1775897147153`

설명:

- Zoom이 이벤트 발생 시점 기준으로 같이 보내는 timestamp 값이다.
- 현재는 number 형태로 들어오고 있다.

### `payload`

설명:

- 실제 도메인 데이터는 거의 다 `payload` 안에 들어 있다.

## 4. payload 구조

### `payload.account_id`

설명:

- Zoom 계정 ID

### `payload.object`

설명:

- 회의와 참가자에 대한 실제 이벤트 대상 데이터

## 5. payload.object 구조

### 회의 공통 정보

- `uuid`
  - 회의 UUID
- `id`
  - 회의 ID
- `type`
  - 회의 타입
- `topic`
  - 회의 제목
- `host_id`
  - 호스트 ID
- `duration`
  - 회의 duration
- `start_time`
  - 회의 시작 시각
- `timezone`
  - 회의 timezone

현재 예시:

```json
{
  "uuid": "MEETING_UUID_EXAMPLE",
  "id": "MEETING_ID_EXAMPLE",
  "type": 3,
  "topic": "회의 제목 예시",
  "host_id": "HOST_ID_EXAMPLE",
  "duration": 60,
  "start_time": "2026-04-11T06:33:13Z",
  "timezone": "America/Los_Angeles"
}
```

## 6. payload.object.participant 구조

이 필드는 참가자 관련 이벤트에서 들어온다.

### join 이벤트에서 확인된 필드

- `public_ip`
- `user_id`
- `user_name`
- `participant_user_id`
- `id`
- `join_time`
- `email`
- `participant_uuid`

### left 이벤트에서 추가로 확인된 필드

- `leave_time`
- `leave_reason`
- `registrant_id`
- `private_ip`

즉 participant 엔티티는 이벤트 타입에 따라 필드가 조금씩 달라진다.

## 7. 현재 실측 기준 participant 필드 정리

### 안정적으로 들어오는 편인 값

- `user_name`
- `user_id`
- `participant_uuid`
- `join_time` 또는 `leave_time`

### 빈 문자열이 자주 보이는 값

- `participant_user_id`
- `id`
- `email`

### left 이벤트에서만 의미가 큰 값

- `leave_reason`
- `private_ip`
- `registrant_id`

## 8. 현재 raw body 해석 시 주의점

### 1. `user_id`는 안정적인 참가자 키가 아닐 수 있음

실측 기준으로 같은 사람의 join/left 사이에서 `user_id`가 달라진 경우가 있었다.

그래서 raw에 들어온다고 해서 바로 주키로 쓰면 안 된다.

### 2. `participant_uuid`가 더 중요한 필드

현재 실측 기준으로는 `participant_uuid`가 join/left 매칭에 더 안정적으로 보인다.

### 3. raw는 해석보다 보존이 우선

raw 엔티티에서는:

- 원본 body를 그대로 보존
- 의미 해석은 도메인 엔티티 단계에서 수행

이 순서를 지키는 게 맞다.

## 9. 현재 서버가 raw를 어떻게 저장하고 있는가

현재 `logs/webhook-events.ndjson`에 저장되는 한 줄은 **Zoom raw body 그대로만 저장된 구조는 아니다**.

현재는 아래처럼 저장한다.

```json
{
  "received_at": "2026-04-11T08:45:47.657Z",
  "event": "meeting.participant_joined",
  "meeting_id": "MEETING_ID_EXAMPLE",
  "meeting_uuid": "MEETING_UUID_EXAMPLE",
  "participant": {
    "public_ip": "203.0.113.10",
    "user_id": "USER_ID_EXAMPLE",
    "user_name": "홍길동",
    "participant_user_id": "",
    "id": "",
    "join_time": "2026-04-11T08:45:45Z",
    "email": "",
    "participant_uuid": "PARTICIPANT_UUID_EXAMPLE"
  },
  "raw": {
    "payload": {
      "account_id": "ACCOUNT_ID_EXAMPLE",
      "object": {
        "uuid": "MEETING_UUID_EXAMPLE",
        "participant": {
          "public_ip": "203.0.113.10",
          "user_id": "USER_ID_EXAMPLE",
          "user_name": "홍길동",
          "participant_user_id": "",
          "id": "",
          "join_time": "2026-04-11T08:45:45Z",
          "email": "",
          "participant_uuid": "PARTICIPANT_UUID_EXAMPLE"
        },
        "id": "MEETING_ID_EXAMPLE",
        "type": 3,
        "topic": "회의 제목 예시",
        "host_id": "HOST_ID_EXAMPLE",
        "duration": 60,
        "start_time": "2026-04-11T06:33:13Z",
        "timezone": "America/Los_Angeles"
      }
    },
    "event_ts": 1775897147153,
    "event": "meeting.participant_joined"
  }
}
```

## 10. 여기서 서버가 추가한 필드

아래 값들은 Zoom 원본 body가 아니라 **서버에서 추가한 값**이다.

- `received_at`
  - 서버 수신 시각
- 최상위 `event`
  - `raw.event`를 꺼내서 상위에 한 번 더 둔 값
- 최상위 `meeting_id`
  - `raw.payload.object.id`를 꺼내서 저장한 값
- 최상위 `meeting_uuid`
  - `raw.payload.object.uuid`를 꺼내서 저장한 값
- 최상위 `participant`
  - `raw.payload.object.participant`를 꺼내서 저장한 값

즉 현재 로그는 아래 구조다.

- 원본 Zoom body: `raw`
- 서버가 추가한 조회용 상위 필드: `received_at`, `meeting_id`, `meeting_uuid`, `participant` 등

## 11. 결론

이 문서에서 말하는 `zoom_raw_webhook_event`의 핵심은 먼저 **Zoom이 보내는 raw body 자체**다.

정리:

- Zoom 원본 엔티티의 기준 필드는 `event`, `event_ts`, `payload`
- `payload.object` 안에 회의 정보와 participant 정보가 들어 있음
- 현재 로그 파일은 raw만 저장하는 포맷이 아니라, raw + 서버 추가 필드 구조
- 따라서 raw 엔티티 정의와 서버 저장 포맷 정의는 분리해서 보는 것이 맞다
