# Setup Guide

이 문서는 `Zoom Live Participants` 프로젝트를 직접 실행해보려는 개발자를 위한 세팅/실행 가이드다.

## 사전 요구 작업

### Zoom 앱 준비

- Server-to-Server OAuth 또는 현재 사용 중인 서버용 앱 자격증명 준비
- `ZOOM_WEBHOOK_SECRET_TOKEN` 확보
- Event Subscriptions 활성화
- webhook endpoint 등록

현재 프로젝트가 수집 대상으로 보는 주요 이벤트:

- `meeting.started`
- `meeting.ended`
- `meeting.participant_joined`
- `meeting.participant_left`

### Slack 앱 준비

- Incoming Webhook URL 발급
- 봇 메시지 삭제 API를 쓸 경우 Bot Token 준비
- 관리용 삭제 API 보호를 위한 별도 키 준비

사용 환경변수:

- `SLACK_WEBHOOK_URL`
- `SLACK_BOT_TOKEN`
- `SLACK_ADMIN_API_KEY`
- `SLACK_NOTIFY_MEETING_ID`
- `SLACK_NOTIFY_EVENTS`

### 환경변수 설정

`.env.example`을 참고해 `.env`를 만든다.

필수 값:

- `ZOOM_ACCOUNT_ID`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_MEETING_ID`
- `ZOOM_WEBHOOK_SECRET_TOKEN`
- `PORT`

선택 값:

- `ZOOM_WEBHOOK_LOCAL_URL`
- `SLACK_WEBHOOK_URL`
- `SLACK_BOT_TOKEN`
- `SLACK_ADMIN_API_KEY`
- `SLACK_NOTIFY_MEETING_ID`
- `SLACK_NOTIFY_EVENTS`

## 실행 방법

### 의존 환경

- Node.js 20 이상
- `cloudflared` 사용 시 Cloudflare Tunnel CLI 설치

### Zoom API 확인용 스크립트

토큰 발급:

```bash
npm run zoom:token
```

live meeting 조회:

```bash
npm run zoom:meeting
```

live participants 조회:

```bash
npm run zoom:participants
```

past meeting instances 조회:

```bash
npm run zoom:past-instances
```

past participants 조회:

```bash
npm run zoom:past-participants
```

### webhook 서버 실행

```bash
npm run zoom:webhook
```

기본 포트:

```text
http://127.0.0.1:3000
```

### 로컬 테스트 이벤트 전송

```bash
npm run zoom:webhook:test -- meeting.started
npm run zoom:webhook:test -- meeting.participant_joined
npm run zoom:webhook:test -- meeting.participant_left
npm run zoom:webhook:test -- meeting.ended
npm run zoom:webhook:test -- endpoint.url_validation
```

### 공개 URL 열기

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

발급된 주소의 `/webhook`를 Zoom Event Subscriptions endpoint로 등록한다.

예:

```text
https://example-subdomain.trycloudflare.com/webhook
```

## 실행 후 확인할 경로

### `GET /health`

서버 생존 확인용 경로다.

### `GET /events`

수신한 webhook 이벤트를 브라우저에서 확인하는 HTML 화면이다.

### `GET /events.json`

수신 이벤트를 JSON으로 확인하는 API다.

### `POST /webhook`

Zoom Event Subscriptions가 호출하는 실제 webhook endpoint다.

### `POST /slack/messages/delete`

Slack 봇이 올린 메시지를 삭제하는 관리용 API다.
