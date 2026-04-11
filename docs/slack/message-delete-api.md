# Slack 메시지 삭제 API

## 목적

봇이 잘못 올린 Slack 메시지를 서버 API로 삭제할 수 있게 한다.

특히 초기 개발 과정에서 로그성 내용까지 같이 올려버린 메시지를 정리하는 용도다.

## 기준 메서드

현재 구현은 Slack Web API `chat.delete` 를 사용한다.

공식 기준:

- endpoint: `POST https://slack.com/api/chat.delete`
- bot token required scope: `chat:write`
- bot token은 해당 봇이 올린 메시지만 삭제 가능

출처:

- https://api.slack.com/methods/chat.delete
- https://api.slack.com/messaging/modifying

## 서버 API

- method: `POST`
- path: `/slack/messages/delete`

## 인증 방식

이 API는 파괴적 기능이라 `x-admin-api-key` 헤더가 필요하다.

필수 환경변수:

- `SLACK_BOT_TOKEN`
- `SLACK_ADMIN_API_KEY`

설명:

- `SLACK_BOT_TOKEN`
  - Slack `chat.delete` 호출용 Bot User OAuth Token
- `SLACK_ADMIN_API_KEY`
  - 현재 서버의 관리용 삭제 API 보호 키

## 요청 형식

헤더:

```text
x-admin-api-key: <SLACK_ADMIN_API_KEY 값>
content-type: application/json
```

body:

```json
{
  "channel": "C1234567890",
  "ts": "1712412345.678900"
}
```

## 응답 예시

성공:

```json
{
  "ok": true,
  "channel": "C1234567890",
  "ts": "1712412345.678900"
}
```

실패 예시:

```json
{
  "ok": false,
  "message": "message_not_found"
}
```

## curl 예시

```bash
curl -X POST http://127.0.0.1:3100/slack/messages/delete \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "channel": "C1234567890",
    "ts": "1712412345.678900"
  }'
```

## 주의

- 이 API는 봇이 올린 메시지만 삭제 가능하다.
- Slack 메시지 삭제에는 `channel` 과 `ts` 가 둘 다 필요하다.
- 현재 프로젝트는 Incoming Webhook 전송 응답에서 메시지 `ts` 를 저장하지 않는다.
- 즉 이미 올라간 메시지를 지우려면 Slack UI 또는 별도 방법으로 `channel`, `ts` 를 확보해야 한다.

## 현재 한계

- 메시지 목록 조회 API는 아직 없음
- 삭제 이력 로그는 아직 없음
- Slack 전송 시 `channel`, `ts` 를 저장하는 구조도 아직 없음

다음 단계에서 필요하면 아래를 이어서 붙일 수 있다.

- 봇 전송 메시지 메타데이터 저장
- 삭제 이력 기록
- 메시지 조회 / 일괄 삭제 보조 API
