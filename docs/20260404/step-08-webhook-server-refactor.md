# Step 08. webhook 서버 코드 구조 분리

## 목적

기존 `server/webhook.mjs` 하나에 몰려 있던 책임을 용도별 모듈로 분리한다.

이번 단계의 목적은 기능 추가가 아니라 유지보수성 개선이다.

## 분리 전 문제

기존 파일 하나에 아래 책임이 함께 들어 있었다.

- `.env` 로드와 런타임 설정
- Zoom 서명 검증
- webhook 로그 파일 저장/조회
- 이벤트 필터링과 HTML 렌더링
- Slack 알림 생성/전송
- HTTP 라우팅과 request 처리

이 구조에서는 Slack 문구 수정, 이벤트 페이지 수정, 서명 검증 수정이 모두 같은 파일에 섞여 충돌하기 쉬웠다.

## 분리 후 구조

- `server/webhook.mjs`
  - 엔트리포인트만 담당
- `server/webhook/config.mjs`
  - `.env` 로드, 포트/secret/slack 설정, Slack 템플릿
- `server/webhook/signature.mjs`
  - Zoom 서명 검증, endpoint validation 응답 생성
- `server/webhook/log-store.mjs`
  - NDJSON 로그 append/read
- `server/webhook/room-context.mjs`
  - 메인/소회의실 추론
- `server/webhook/events-view.mjs`
  - 이벤트 필터링, `/events` HTML 렌더링
- `server/webhook/slack-notifier.mjs`
  - Slack 전송 여부 판단, 랜덤 문구 생성, POST 전송
- `server/webhook/http-response.mjs`
  - JSON/HTML 응답 유틸
- `server/webhook/server-app.mjs`
  - 라우팅과 webhook 요청 처리 조립

## 유지한 점

- 실행 명령은 그대로 유지
  - `npm run zoom:webhook`
- 기존 endpoint 유지
  - `GET /health`
  - `GET /events`
  - `GET /events.json`
  - `POST /webhook`
- 기존 Slack 알림 동작 유지
- 기존 로그 파일 저장 경로 유지

## 기대 효과

- Slack 문구 수정은 `slack-notifier.mjs`, `config.mjs`만 보면 된다.
- 이벤트 페이지 수정은 `events-view.mjs`만 보면 된다.
- Zoom 검증 로직 수정은 `signature.mjs`만 보면 된다.
- 이후 세션 매칭이나 DB 저장 로직을 추가할 때 `server-app.mjs`에 전부 몰아넣지 않아도 된다.
