# Step 04. 실제 Zoom 입/퇴장 webhook 실측

작성일:

- 2026-04-04

## 이번 단계 목적

Step 03까지 새 앱 기준으로 webhook 준비는 확인됐다.

이번 단계 목적은 실제 Zoom 회의 `89791995600` 에서 입장/퇴장 이벤트가 도착하는지 실측하는 것이다.

핵심 검증 대상:

- `meeting.participant_joined`
- `meeting.participant_left`

보조 관찰 대상:

- `meeting.started`
- `meeting.ended`

운영 메모:

- 이 회의는 상시 열려 있는 회의 성격이므로 `started/ended`보다 `join/left` 실측이 핵심이다.

## 실측 환경

webhook 서버:

- `PORT=3100 node server/webhook.mjs`

Cloudflare Quick Tunnel:

- `https://possible-assumed-celebrity-jon.trycloudflare.com`

Zoom webhook endpoint:

- `https://possible-assumed-celebrity-jon.trycloudflare.com/webhook`

사전 확인:

- `GET /health` 성공
- `/events.json` 조회 가능

## 실측 결과

### 1. participant_joined 수신

확인된 이벤트:

- `meeting.participant_joined`

핵심 값:

- `meeting_id`: `89791995600`
- `meeting_uuid`: `CC/pxpNaS0icvseMbDQ2KA==`
- `participant.user_id`: `16842752`
- `participant.user_name`: `이현호`
- `participant.participant_uuid`: `FDDC7C6F-D51D-137B-20AF-64D77D0CE70D`
- `participant.join_time`: `2026-04-03T17:06:25Z`

관찰:

- `participant.id` 는 빈 문자열
- `participant.email` 도 빈 문자열

### 2. participant_left 수신

확인된 이벤트:

- `meeting.participant_left`

핵심 값:

- `meeting_id`: `89791995600`
- `meeting_uuid`: `CC/pxpNaS0icvseMbDQ2KA==`
- `participant.user_id`: `16841728`
- `participant.user_name`: `이현호`
- `participant.participant_uuid`: `FDDC7C6F-D51D-137B-20AF-64D77D0CE70D`
- `participant.leave_time`: `2026-04-03T17:06:25Z`

관찰:

- `participant.id` 는 빈 문자열
- `participant.email` 도 빈 문자열
- `participant.leave_reason` 값이 포함된다

## 이번 단계에서 확인된 사실

확정:

- 새 앱 기준으로 실제 `meeting.participant_joined` 이벤트가 도착했다.
- 새 앱 기준으로 실제 `meeting.participant_left` 이벤트가 도착했다.
- 두 이벤트 모두 `meeting_id=89791995600` 으로 들어왔다.
- 두 이벤트 모두 동일한 `meeting_uuid` 를 포함했다.
- participant 식별에는 `user_name`, `participant_uuid` 가 유효하게 보인다.

추정:

- 출입 로그 수준의 프로젝트는 webhook 이벤트만으로도 구현 가능할 가능성이 높다.

미확정:

- `meeting.started`, `meeting.ended` 가 이 회의 유형에서 안정적으로 오는지
- `participant.user_id` 가 join/left 간 완전히 안정적인 키인지
- `participant.email` 없이도 요구사항을 만족하는지

## 중요한 관찰

같은 사용자명 `이현호` 에 대해:

- `meeting.participant_joined` 의 `participant.user_id` 는 `16842752`
- `meeting.participant_left` 의 `participant.user_id` 는 `16841728`
- 하지만 `participant.participant_uuid` 는 동일하게 보인다.

판독:

- join/left 매칭 키로는 `user_id` 보다 `participant_uuid` 가 더 안정적일 가능성이 있다.
- 따라서 실제 출입 추적 로직은 `participant_uuid` 우선, `user_name` 보조 전략으로 보는 편이 안전하다.

## 결과 판정

현재 단계 판정:

- `A. webhook 실측 성공`

의미:

- 현재 Pro 계정에서도 실시간 참가자 `이벤트 로그` 수집은 가능하다.
- REST snapshot 은 안 되지만 webhook 기반 입/퇴장 추적은 현실적인 경로다.

## 다음 단계

다음 우선순위:

1. `meeting.started`, `meeting.ended` 도 실제로 오는지 추가 실측
2. join/left 매칭 키를 `participant_uuid` 중심으로 설계
3. 필요하면 이벤트 로그를 파일이 아니라 DB 구조로 바꾸기

## 이번 단계 결론

2026-04-04 기준 새 Zoom 앱과 새 회의 ID `89791995600` 에서 webhook 실측은 성공했다.

- `meeting.participant_joined` 수신 성공
- `meeting.participant_left` 수신 성공

따라서 현재 계정의 현실적인 구현 경로는 `REST snapshot` 이 아니라 `webhook 기반 출입 이벤트 수집`이다.
