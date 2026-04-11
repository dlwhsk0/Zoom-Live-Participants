# 현재 Slack 연동 기능 정리

## 목적

현재 프로젝트에 이미 구현되어 있는 Slack 연동 기능을 코드 기준으로 다시 정리한다.

이 문서는 이후 Slack 관련 기능을 확장하기 전에 현재 상태를 고정해서 기록하는 용도다.

## 현재 구현 위치

- `server/webhook/slack-notifier.mjs`
- `server/webhook/config.mjs`

## 동작 흐름

1. Zoom webhook 서버가 이벤트를 수신한다.
2. webhook entry를 만든다.
3. `notifySlack(entry)`를 호출한다.
4. Slack 전송 조건을 통과하면 Incoming Webhook URL로 POST 한다.

즉 현재 구조는 `Zoom webhook -> 서버 필터링 -> Slack Incoming Webhook 전송` 이다.

## 사용하는 환경변수

- `SLACK_WEBHOOK_URL`
  - Slack Incoming Webhook URL
  - 비어 있으면 Slack 전송 자체를 하지 않는다.
- `SLACK_NOTIFY_MEETING_ID`
  - 특정 회의 ID만 Slack으로 보내고 싶을 때 사용
  - 값이 있으면 `entry.meeting_id`와 정확히 일치할 때만 전송
- `SLACK_NOTIFY_EVENTS`
  - 쉼표로 구분된 이벤트 목록
  - 값이 있으면 목록에 포함된 이벤트만 전송

## 현재 전송 조건

현재 Slack 전송은 아래 조건을 모두 만족해야 한다.

1. `SLACK_WEBHOOK_URL` 이 설정되어 있어야 한다.
2. `SLACK_NOTIFY_MEETING_ID` 가 설정되어 있으면 현재 이벤트의 `meeting_id` 와 같아야 한다.
3. `SLACK_NOTIFY_EVENTS` 가 설정되어 있으면 현재 이벤트명이 목록에 포함되어야 한다.

## 현재 메시지 생성 방식

현재 Slack 메시지는 이벤트별 랜덤 템플릿을 사용한다.

- 입장 이벤트
  - `slackJoinTemplates`
- 퇴장 이벤트
  - `slackLeftTemplates`

현재 템플릿 특징:

- 한국어 위주
- 이모지 포함
- `{name}` 자리에 참가자 이름 치환
- 이름은 Slack bold 처리
- 문장 전체는 italic 처리

최종 Slack payload 형식은 현재 아래처럼 단순하다.

```json
{
  "text": "_:tada: *홍길동* 님께서 입장하십니다~! :fire:_"
}
```

## 현재 메시지 내용 정책

Slack에는 현재 `첫 문장만` 보낸다.

보내는 것:

- 랜덤 알림 문구 1줄

보내지 않는 것:

- 회의 ID
- 회의 UUID
- participant UUID
- user ID
- room scope 로그 문자열
- raw payload

즉 상세 로그는 Slack이 아니라 웹 화면과 파일 로그에서 본다.

## 상세 로그 확인 위치

Slack에 보내지 않는 상세 정보는 아래에서 확인한다.

- `/events`
- `/events.json`
- `logs/webhook-events.ndjson`

## 현재 코드 기준 주요 함수

### `shouldNotifySlack(entry)`

역할:

- Slack 전송 여부 판정

판정 기준:

- webhook URL 존재 여부
- meeting ID 필터
- event 필터

### `buildSlackMessage(entry)`

역할:

- 입장/퇴장 이벤트에 맞는 템플릿 선택
- 참가자 이름 치환
- Slack markdown 적용

현재 포맷:

- `*이름*` 으로 bold
- 전체 문장 `_..._` 으로 italic

### `notifySlack(entry)`

역할:

- Slack Incoming Webhook으로 실제 POST 전송
- 실패 시 에러를 throw

## 현재 한계

- 채널 분기 없음
- 이벤트별 다른 포맷 확장 없음
- 회의실 유형에 따른 Slack 문구 분기 없음
- 쓰레드 전송 없음
- 배치 요약 없음
- 재시도 로직 없음

즉 현재 구현은 `단일 채널에 랜덤 알림 문구를 즉시 보내는 1차 버전`이다.

## 다음 확장 후보

- 봇 메시지 삭제 API
- 메인 회의실 / 소회의실 기준 문구 분기
- 특정 참가자명 패턴별 문구 분기
- 특정 회의별 Slack 채널 분기
- join/left 요약 메시지
- 에러 재시도와 실패 로그 분리
