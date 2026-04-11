# Step 07. Slack Incoming Webhook 구현

작성일:

- 2026-04-04

## 이번 단계 목적

Step 06까지 Slack Incoming Webhook 생성 절차는 정리됐다.

이번 단계 목적은 현재 Zoom webhook 서버에서 실제 `meeting.participant_joined`, `meeting.participant_left` 이벤트를 Slack 채널로 전송하도록 구현하는 것이다.

## 이번 단계에서 추가한 구현

보완 파일:

- `server/webhook.mjs`

구현 내용:

- `.env` 의 `SLACK_WEBHOOK_URL` 로 Slack Incoming Webhook POST 추가
- `SLACK_NOTIFY_MEETING_ID` 필터 추가
- `SLACK_NOTIFY_EVENTS` 필터 추가
- Zoom join/left 이벤트를 Slack 메시지 형태로 변환하는 로직 추가

## 환경변수 사용 방식

필수:

- `SLACK_WEBHOOK_URL`

선택:

- `SLACK_NOTIFY_MEETING_ID`
- `SLACK_NOTIFY_EVENTS`

현재 권장값:

- `SLACK_NOTIFY_MEETING_ID=89791995600`
- `SLACK_NOTIFY_EVENTS=meeting.participant_joined,meeting.participant_left`

## Slack 메시지 구성

포함 필드:

- 사용자명
- event 이름
- meeting_id
- meeting_uuid
- participant_uuid
- user_id
- room 추론값
- join/leave 시각
- leave_reason

## room 표시 규칙

현재 기준:

- 입장은 기본적으로 `main_join`
- 일반 퇴장은 `meeting_left`
- `leave_reason`에 `left the meeting to join breakout room`가 있으면 `temporary_breakout_exit`
- 같은 `participant_uuid`의 직전 이벤트가 임시 퇴장이면 다음 입장은 `breakout_join_inferred`

## 현재 구현 의미

확정:

- Zoom webhook 이벤트를 파일 로그에 저장하면서 동시에 Slack으로 알릴 수 있는 구조가 됐다.
- 알림 범위를 회의 ID와 이벤트 이름 기준으로 제한할 수 있다.

미확정:

- 실제 Slack 채널에 메시지가 정상 도착했는지
- Slack 메시지 포맷을 block kit 으로 더 다듬을지

## 다음 검증

1. 서버 재시작
2. Zoom 입장 이벤트 발생
3. Slack 채널 수신 확인
4. Zoom 퇴장 이벤트 발생
5. Slack 채널 수신 확인

## 이번 단계 결론

이제 현재 프로젝트는 Zoom 입/퇴장 이벤트를 `파일 로그 + 웹 페이지 + Slack 채널`로 동시에 전달할 수 있는 상태가 됐다.
