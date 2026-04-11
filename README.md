# Zoom Live Participants

Zoom 회의의 참가자 입장/퇴장 webhook을 수집하고, 브라우저 화면과 Slack 알림으로 확인하는 프로젝트다.

이 저장소는 크게 두 가지를 제공한다.

- Zoom webhook 수신 서버
- 수신 이벤트 확인 화면과 Slack 알림 연동

상세 검증 기록과 단계별 메모는 `docs/` 아래에 정리한다. 이 README는 실행과 운영에 필요한 최상위 가이드만 다룬다.

## 사전 요구 작업

### 1. Zoom 앱 준비

Zoom 앱에서 아래 준비가 필요하다.

- Server-to-Server OAuth 또는 현재 사용 중인 서버용 앱 자격증명 준비
- `ZOOM_WEBHOOK_SECRET_TOKEN` 확보
- Event Subscriptions 활성화
- webhook endpoint 등록

현재 프로젝트가 수집 대상으로 보는 주요 이벤트:

- `meeting.started`
- `meeting.ended`
- `meeting.participant_joined`
- `meeting.participant_left`

### 2. Slack 앱 준비

Slack 연동을 쓰려면 아래 준비가 필요하다.

- Incoming Webhook URL 발급
- 봇 메시지 삭제 API를 쓸 경우 Bot Token 준비
- 관리용 삭제 API 보호를 위한 별도 키 준비

사용 환경변수:

- `SLACK_WEBHOOK_URL`
- `SLACK_BOT_TOKEN`
- `SLACK_ADMIN_API_KEY`
- `SLACK_NOTIFY_MEETING_ID`
- `SLACK_NOTIFY_EVENTS`

### 3. 환경변수 설정

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

### 1. 의존 환경

- Node.js 20 이상
- `cloudflared` 사용 시 Cloudflare Tunnel CLI 설치

### 2. Zoom API 확인용 스크립트

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

### 3. webhook 서버 실행

```bash
npm run zoom:webhook
```

기본 포트:

```text
http://127.0.0.1:3000
```

### 4. 로컬 테스트 이벤트 전송

```bash
npm run zoom:webhook:test -- meeting.started
npm run zoom:webhook:test -- meeting.participant_joined
npm run zoom:webhook:test -- meeting.participant_left
npm run zoom:webhook:test -- meeting.ended
npm run zoom:webhook:test -- endpoint.url_validation
```

### 5. 공개 URL 열기

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

응답 예:

```json
{
  "ok": true
}
```

### `GET /events`

수신한 webhook 이벤트를 브라우저에서 확인하는 HTML 화면이다.

현재 페이지에서 볼 수 있는 내용:

- 입장/퇴장 이벤트 목록
- 메인 회의실 / 소회의실 / 소회의실 퇴장 / 소회의실 이동 추정 구분
- 참가자 이름, 참가자 ID, participant UUID
- 현재 필터 기준 이벤트 집계

### `GET /events.json`

수신 이벤트를 JSON으로 확인하는 API다.

필터링과 디버깅용으로 사용한다.

### `POST /webhook`

Zoom Event Subscriptions가 호출하는 실제 webhook endpoint다.

기능:

- Zoom 서명 검증
- `endpoint.url_validation` 응답
- 이벤트 로그 저장
- Slack 알림 전송

### `POST /slack/messages/delete`

Slack 봇이 올린 메시지를 삭제하는 관리용 API다.

필수:

- `x-admin-api-key` 헤더
- `SLACK_BOT_TOKEN`
- `channel`
- `ts`

## 현재 수집/처리하는 이벤트

핵심 수집 이벤트:

- `meeting.participant_joined`
- `meeting.participant_left`

보조 이벤트:

- `meeting.started`
- `meeting.ended`
- `endpoint.url_validation`

현재 서버는 이벤트를 수신하면 아래 순서로 처리한다.

1. Zoom 요청 서명 검증
2. 정규화된 entry 생성
3. `logs/webhook-events.ndjson` 저장
4. `/events`, `/events.json`에서 조회 가능 상태로 반영
5. 조건이 맞으면 Slack 알림 전송

## 로그와 문서 위치

이벤트 로그:

- `logs/webhook-events.ndjson`

상세 검증 문서:

- `docs/20260322`
- `docs/20260404`
- `docs/slack`

## 참고

- 현재 구현은 webhook 기반 참가자 이벤트 수집과 Slack 알림에 초점이 있다.
- 설계 메모, 엔티티 재정의, 추가 운영 문서는 `docs/` 아래에 계속 분리해서 쌓는다.
