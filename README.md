# Zoom Live Participants

Zoom 회의 참가자의 입장/퇴장 이벤트를 수집하고, 이를 웹 화면과 Slack 알림으로 확인할 수 있게 만드는 프로젝트다.

이 프로젝트는 Zoom의 실시간 webhook 이벤트를 받아 다음과 같은 운영 흐름을 지원한다.

- 참가자 입장/퇴장 이벤트 수집
- 메인 회의실 / 소회의실 관련 이벤트 구분
- 브라우저 기반 이벤트 모니터링
- Slack 알림 전송
- 잘못 전송된 봇 메시지 삭제용 관리 API

세부 검증 메모와 구현 과정은 `docs/` 아래에 정리한다. 이 README는 프로젝트를 처음 보는 사람이 전체 방향과 현재 제공 기능을 빠르게 이해하도록 돕는 문서다.

## 누구를 위한 레포인가

### 개발자

이 레포를 포크해서 직접 실행해보거나, Zoom webhook 기반 출결/알림 시스템을 확장하려는 사람을 위한 프로젝트다.

개발자라면 아래 문서를 먼저 보면 된다.

- 세팅 가이드: [`docs/setup/README.md`](/Users/hana/ZoomAttandance/zoom-live-participants/docs/setup/README.md#L1)
- Slack 관련 문서: [`docs/slack/README.md`](/Users/hana/ZoomAttandance/zoom-live-participants/docs/slack/README.md#L1)

### 기획자 / 사용자

이 프로젝트가 현재 어떤 기능을 제공하는지, 앞으로 어떤 운영 기능이 추가될 예정인지 알고 싶은 사람을 위한 설명은 아래 기능 목록과 예정 기능 섹션을 보면 된다.

## 현재 프로젝트 설명

현재 구현은 `Zoom webhook 수집 서버`와 `운영 확인용 화면/Slack 연동`에 초점을 맞춘다.

핵심 포인트:

- Zoom Event Subscription을 통해 참가자 입장/퇴장 이벤트를 수집한다.
- 수신 이벤트는 로컬 로그 파일에 저장된다.
- `/events` 화면에서 현재까지 수집된 이벤트를 확인할 수 있다.
- Slack으로 입장/퇴장 알림을 보낼 수 있다.
- 관리용 API를 통해 봇이 보낸 Slack 메시지를 삭제할 수 있다.

## 현재 기능 목록

### Zoom webhook 수집

- `meeting.participant_joined` 수집
- `meeting.participant_left` 수집
- `meeting.started` 수집
- `meeting.ended` 수집
- `endpoint.url_validation` 처리

### 이벤트 저장

- webhook 이벤트를 `logs/webhook-events.ndjson`에 저장
- 조회를 위해 일부 필드를 정규화하고, 원본 payload는 `raw`로 함께 보관

### 웹 화면

- `GET /health`
  - 서버 생존 확인
- `GET /events`
  - 수집 이벤트 HTML 화면
- `GET /events.json`
  - 수집 이벤트 JSON 조회

`/events`에서 현재 확인 가능한 내용:

- 참가자 입장/퇴장 기록
- 메인 회의실 / 소회의실 / 소회의실 퇴장 / 소회의실 이동 추정 구분
- 참가자 이름, 참가자 ID, participant UUID
- 필터 기준 이벤트 집계

### Slack 연동

- Incoming Webhook으로 입장/퇴장 알림 전송
- 랜덤 템플릿 기반 메시지
- 이름 bold, 문장 italic 스타일링
- 특정 회의 ID만 전송하는 필터
- 특정 이벤트만 전송하는 필터

### Slack 관리 API

- `POST /slack/messages/delete`
  - 봇이 보낸 Slack 메시지 삭제
  - `SLACK_BOT_TOKEN`, `SLACK_ADMIN_API_KEY` 필요

## 추후 추가될 예정 기능

### Admin

- 슬랙 메시지 템플릿 CRUD
- 봇 메시지 삭제 고도화
- 입퇴장 누락 기록 누락 방지
  - 채팅 이벤트 체킹 기반 보완
- 회의 시작/종료 시 Slack 메시지 전송

## 세팅과 실행

세팅 방법과 실행 절차는 README에서 분리했다.

아래 문서를 기준으로 진행하면 된다.

- [`docs/setup/README.md`](/Users/hana/ZoomAttandance/zoom-live-participants/docs/setup/README.md#L1)

## 문서 위치

- 초기 검증 문서: [`docs/20260322`](/Users/hana/ZoomAttandance/zoom-live-participants/docs/20260322#L1)
- 재검증 문서: [`docs/20260404`](/Users/hana/ZoomAttandance/zoom-live-participants/docs/20260404#L1)
- Slack 문서: [`docs/slack`](/Users/hana/ZoomAttandance/zoom-live-participants/docs/slack#L1)
