# Step 06. Slack Incoming Webhook 생성과 연동 준비

작성일:

- 2026-04-04

## 이번 단계 목적

현재 프로젝트는 Zoom webhook 이벤트를 실제로 수신할 수 있는 상태다.

이번 단계 목적은 이 이벤트를 Slack 채널로 전달하기 위한 `Slack Incoming Webhook` 생성 절차와 프로젝트 연동 준비 항목을 정리하는 것이다.

## 왜 Incoming Webhook 부터 쓰는가

현재 프로젝트 요구사항 기준으로는 Slack Bot 전체를 붙이기보다 Incoming Webhook이 더 단순하고 적합하다.

이유:

- Zoom 이벤트를 Slack 채널에 단방향 알림으로 보내면 된다.
- 별도 Slack slash command, interactivity, bot event 처리까지는 지금 단계에서 필요 없다.
- 현재 Node 서버에서 HTTP POST 한 번으로 바로 연동할 수 있다.

## Slack 쪽 생성 절차

### 1. Slack 앱 생성

Slack 앱 관리 화면에서 새 앱을 만든다.

절차:

1. Slack API 앱 페이지로 이동
2. `Create New App`
3. `From scratch`
4. 앱 이름 입력
5. 연결할 Workspace 선택
6. 앱 생성

### 2. Incoming Webhooks 활성화

앱 설정 화면에서 `Incoming Webhooks` 메뉴로 이동한다.

절차:

1. `Incoming Webhooks`
2. `Activate Incoming Webhooks` 를 `On`

### 3. Webhook URL 발급

절차:

1. `Add New Webhook to Workspace`
2. 메시지를 보낼 채널 선택
3. `Authorize`
4. 발급된 URL 복사

발급 형태 예시:

```text
https://hooks.slack.com/services/<team>/<channel>/<secret>
```

주의:

- 이 URL은 secret 이므로 공개 저장소나 문서에 직접 넣으면 안 된다.

## 프로젝트 쪽 준비

### 1. .env 에 추가할 값

추가 예정 키:

```bash
SLACK_WEBHOOK_URL=
```

선택 키 예시:

```bash
SLACK_NOTIFY_MEETING_ID=89791995600
SLACK_NOTIFY_EVENTS=meeting.participant_joined,meeting.participant_left
```

### 2. 권장 1차 연동 범위

초기에는 아래 두 이벤트만 Slack으로 보내는 것이 적절하다.

- `meeting.participant_joined`
- `meeting.participant_left`

이유:

- 현재 실측에서 이미 성공한 이벤트다.
- `started/ended` 는 상시 회의 특성상 우선순위가 낮다.

### 3. Slack 메시지 초안

입장:

```text
[Zoom] 이현호 입장
- meeting_id: 89791995600
- participant_uuid: FDDC7C6F-D51D-137B-20AF-64D77D0CE70D
- room: main_join
- join_time: 2026-04-03T17:06:25Z
```

퇴장:

```text
[Zoom] 이현호 퇴장
- meeting_id: 89791995600
- participant_uuid: FDDC7C6F-D51D-137B-20AF-64D77D0CE70D
- room: temporary_breakout_exit
- leave_time: 2026-04-03T17:45:29Z
- reason: left the meeting to join breakout room
```

## 현재 프로젝트에 붙일 구현 위치

가장 자연스러운 위치:

- `server/webhook.mjs`

처리 흐름:

1. Zoom webhook 수신
2. entry 생성 및 파일 로그 저장
3. `meeting.participant_joined`, `meeting.participant_left` 인지 판별
4. Slack Incoming Webhook URL 로 POST

## 공식 근거

1. Slack 공식 문서
   `Sending messages using incoming webhooks`
   https://api.slack.com/incoming-webhooks

핵심 내용:

- Slack 앱 생성
- Incoming Webhooks 활성화
- `Add New Webhook to Workspace`
- 발급된 URL로 JSON POST

2. Slack scope 문서
   `incoming-webhook`
   https://api.slack.com/scopes/incoming-webhook

핵심 내용:

- Incoming Webhook을 사용하려면 `incoming-webhook` 권한이 사용된다.
- 설치 과정에서 채널 선택이 포함된다.

## 결과 판정

현재 단계 판정:

- `Slack 연동 준비 가능`

의미:

- Slack Webhook URL만 발급되면 현재 Zoom webhook 서버에 바로 붙일 수 있다.

## 다음 단계

다음 우선순위:

1. Slack Incoming Webhook URL 발급
2. `.env` 에 `SLACK_WEBHOOK_URL` 추가
3. `server/webhook.mjs` 에 Slack 알림 POST 구현
4. Zoom 입/퇴장 이벤트 발생 후 Slack 채널 수신 확인

## 이번 단계 결론

현재 프로젝트는 Slack Incoming Webhook과 연결하기에 충분한 상태다.

따라서 다음 실제 구현은 `SLACK_WEBHOOK_URL` 을 받아서 Zoom 입/퇴장 이벤트를 Slack으로 전달하는 것이다.
