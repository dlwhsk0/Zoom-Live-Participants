# Zoom Raw Webhook Entity

## 목적

Zoom이 webhook으로 보낸 원본 내용을 최대한 손상 없이 저장하는 엔티티를 정의한다.

이 엔티티는 재처리와 디버깅을 위한 기준 데이터다.

즉:

- Zoom이 실제로 무엇을 보냈는지 보존
- 파서가 바뀌어도 다시 읽을 수 있게 유지
- 도메인 엔티티 생성의 원천 데이터로 사용

## 현재 사실

현재 프로젝트는 `logs/webhook-events.ndjson`에 이벤트를 저장한다.

하지만 저장 포맷 전체가 Zoom raw body 그대로는 아니다.

현재 저장 구조는 아래 두 부분으로 나뉜다.

1. 서버가 꺼내서 평탄화한 상위 필드
2. `raw` 안에 보관한 Zoom 원본 body

현재 코드 기준 생성 위치:

- `server/webhook/server-app.mjs`
- `buildWebhookEntry(body)`

## 현재 로그 저장 포맷

현재 `webhook-events.ndjson`의 한 줄은 대략 아래 형태다.

```json
{
  "received_at": "2026-04-11T08:20:09.000Z",
  "event": "meeting.participant_left",
  "meeting_id": "89791995600",
  "meeting_uuid": "xxxxxxxx",
  "participant": {
    "user_name": "홍길동",
    "user_id": "16841728",
    "participant_uuid": "FDDC..."
  },
  "raw": {
    "event": "meeting.participant_left",
    "payload": {
      "object": {
        "id": "89791995600",
        "uuid": "xxxxxxxx",
        "participant": {
          "user_name": "홍길동",
          "user_id": "16841728",
          "participant_uuid": "FDDC..."
        }
      }
    }
  }
}
```

## 엔티티 구분

### 1. raw 저장 관점의 원칙

raw 저장 엔티티는 아래를 만족해야 한다.

- Zoom body 전체를 그대로 보존
- 원본 body에 없는 서버 메타데이터는 분리 저장
- 원본과 파생 데이터를 섞되, 경계를 명확히 유지

### 2. 현재 로그의 의미

현재 로그는 순수 raw 엔티티가 아니라 `raw + lightweight index` 형태다.

정리:

- `received_at`
  - 서버 수신 시각
- `event`
  - 조회 편의를 위한 상위 복사값
- `meeting_id`
  - 조회 편의를 위한 상위 복사값
- `meeting_uuid`
  - 조회 편의를 위한 상위 복사값
- `participant`
  - 조회 편의를 위한 상위 복사값
- `raw`
  - Zoom 원본 body 전체

## 권장 Raw 엔티티 정의

이후 DB나 정식 저장소로 옮길 때는 아래 엔티티로 정의하는 것을 권장한다.

### 엔티티명

- `zoom_raw_webhook_event`

### 필드 제안

- `id`
  - 내부 PK
- `received_at`
  - 서버가 실제로 받은 시각
- `source`
  - 기본값 `zoom_webhook`
- `event_name`
  - 예: `meeting.participant_joined`
- `meeting_id`
  - raw에서 추출한 회의 ID
- `meeting_uuid`
  - raw에서 추출한 회의 UUID
- `participant_uuid`
  - raw에서 추출 가능하면 저장
- `user_name`
  - raw에서 추출 가능하면 저장
- `user_id`
  - raw에서 추출 가능하면 저장
- `raw_json`
  - Zoom body 전체 원본 JSON

## 필드별 성격

### 서버 메타데이터

- `id`
- `received_at`
- `source`

### raw에서 추출한 인덱스 필드

- `event_name`
- `meeting_id`
- `meeting_uuid`
- `participant_uuid`
- `user_name`
- `user_id`

### 원본 보존 필드

- `raw_json`

## 왜 raw와 파생값을 같이 두는가

이유는 단순하다.

- raw만 두면 조회와 필터링이 불편하다.
- 파생값만 두면 파서 오류가 났을 때 원본 근거가 사라진다.

따라서 raw 엔티티는

- 원본 보존
- 빠른 검색용 인덱스 필드

를 함께 가지는 것이 맞다.

## 현재 알고 있는 Zoom participant 관련 주요 raw 필드

실측 기준 주요 필드:

- `participant.user_name`
- `participant.user_id`
- `participant.participant_uuid`
- `participant.join_time`
- `participant.leave_time`
- `participant.leave_reason`

실측 기준 빈 값이거나 불안정했던 필드:

- `participant.id`
- `participant.email`
- `participant.participant_user_id`

## 현재 해석 주의점

- `user_id`는 join/left 사이에서 바뀔 수 있다.
- `participant_uuid`가 현재 기준 가장 안정적인 참가자 매칭 키 후보다.
- raw 엔티티는 해석보다 보존이 우선이다.

즉 raw 엔티티에서는 가공보다 원본 보존이 더 중요하다.

## 결론

`zoom_raw_webhook_event`는 앞으로 모든 도메인 파생 데이터의 기준 원본이다.

이 엔티티는 삭제하거나 축약하지 말고, 원본 body와 최소 인덱스 필드를 함께 보관하는 방향으로 정의하는 것이 맞다.
