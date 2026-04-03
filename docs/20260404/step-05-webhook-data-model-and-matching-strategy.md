# Step 05. Webhook 데이터 모델과 매칭 전략

작성일:

- 2026-04-04

## 이번 단계 목적

Step 04에서 실제 `meeting.participant_joined`, `meeting.participant_left` 이벤트 수신은 확인됐다.

이번 단계 목적은 `이 이벤트를 어떤 키로 저장하고 어떻게 join/left 를 매칭할지`를 정리하는 것이다.

## 입력 데이터에서 확인한 핵심 필드

실측 기준 이벤트 공통 필드:

- `event`
- `meeting_id`
- `meeting_uuid`
- `participant.user_name`
- `participant.user_id`
- `participant.participant_uuid`

join 이벤트에서 확인한 추가 필드:

- `participant.join_time`

left 이벤트에서 확인한 추가 필드:

- `participant.leave_time`
- `participant.leave_reason`

실측 기준 빈 값이었던 필드:

- `participant.id`
- `participant.email`
- `participant.participant_user_id`

## 가장 중요한 관찰

같은 사용자 `이현호` 에 대해:

- join 이벤트의 `participant.user_id`: `16842752`
- left 이벤트의 `participant.user_id`: `16841728`
- join/left 모두 `participant.participant_uuid`: `FDDC7C6F-D51D-137B-20AF-64D77D0CE70D`

판독:

- `user_id` 는 join/left 사이에서 안정적인 키라고 보기 어렵다.
- 현재 실측 기준으로는 `participant_uuid` 가 가장 안정적인 join/left 매칭 후보다.

## 권장 매칭 전략

우선순위 1:

- `meeting_uuid + participant.participant_uuid`

이유:

- 같은 회의 instance 안에서 참가자 단위 식별자로 가장 일관되게 보인다.

우선순위 2:

- `meeting_uuid + user_name + join_time 근접값`

이유:

- `participant_uuid` 가 누락되는 예외 상황을 대비한 보조 전략이 필요하다.

비권장:

- `user_id` 단독
- `user_name` 단독

이유:

- 실측 기준 `user_id` 는 join/left 간 달라졌다.
- `user_name` 은 동명이인과 이름 변경 문제를 피할 수 없다.

## 최소 저장 스키마 제안

### 1. raw_events

용도:

- 원본 webhook payload 보존
- 추후 파서 수정 시 재처리 가능

권장 필드:

- `id`
- `received_at`
- `event`
- `meeting_id`
- `meeting_uuid`
- `participant_uuid`
- `user_name`
- `user_id`
- `raw_json`

### 2. participant_sessions

용도:

- 입장/퇴장 한 쌍을 하나의 세션으로 관리

권장 필드:

- `id`
- `meeting_id`
- `meeting_uuid`
- `participant_uuid`
- `user_name`
- `join_user_id`
- `left_user_id`
- `join_time`
- `leave_time`
- `leave_reason`
- `status`

status 후보:

- `joined`
- `left`
- `orphan_left`

## 세션 업데이트 규칙 초안

### join 이벤트 수신 시

1. raw event 저장
2. `meeting_uuid + participant_uuid` 기준 열린 세션이 없으면 새 세션 생성
3. `join_time`, `join_user_id`, `user_name`, `status=joined` 저장

### left 이벤트 수신 시

1. raw event 저장
2. `meeting_uuid + participant_uuid` 기준 열린 세션 탐색
3. 있으면 `leave_time`, `left_user_id`, `leave_reason`, `status=left` 업데이트
4. 없으면 `orphan_left` 세션으로 저장

## 현재 제약

확정:

- email 기반 식별은 현재 payload에서 기대하기 어렵다.
- REST snapshot 이 없으므로 현재 시점 전체 참가자 목록을 복원하는 구조는 불가능하다.

의미:

- 이 프로젝트의 데이터 모델은 `실시간 전체 목록`이 아니라 `출입 이벤트 로그` 중심이어야 한다.

## 결과 판정

현재 단계 판정:

- `webhook 이벤트 로그 기반 설계 가능`

## 다음 단계

다음 우선순위:

1. 실제 코드에 세션 매칭 로직 반영
2. `participant_uuid` 우선 전략으로 join/left 묶기
3. 필요하면 started/ended 이벤트도 보조 메타데이터로 저장

## 이번 단계 결론

현재 계정과 회의 유형에서는 `participant_uuid` 중심 매칭 전략이 가장 현실적이다.

따라서 이후 구현은 `REST snapshot 대체`가 아니라 `webhook 이벤트 로그 + 세션 매칭` 구조로 가는 것이 맞다.
