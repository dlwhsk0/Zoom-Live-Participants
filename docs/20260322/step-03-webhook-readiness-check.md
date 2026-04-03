# Step 03. Webhook 수신 준비도 검증

작성일:

- 2026-03-22

## 이번 단계 목적

Step 02 결론상 현재 계정에서는 REST API 기반 `live participants`, `past participants` 모두 사용할 수 없다.

따라서 이번 단계 목적은 `webhook 경로가 실제 실측 단계로 넘어갈 준비가 되어 있는지`를 확인하는 것이다.

검증 대상:

- `meeting.started`
- `meeting.participant_joined`
- `meeting.participant_left`
- `meeting.ended`
- `endpoint.url_validation`

## 이번 단계에서 추가한 구현

추가/보완 파일:

- `scripts/sendTestWebhook.mjs`
- `package.json`
- `README.md`

구현 내용:

- `.env` 의 `ZOOM_WEBHOOK_SECRET_TOKEN`을 사용해 Zoom 방식의 HMAC 서명을 생성하는 로컬 테스트 스크립트 추가
- `zoom:webhook:test` 실행 경로 추가
- README에 webhook 로컬 검증 절차 추가

## 실행한 검증

### 1. webhook 서버 기동

실행:

```bash
PORT=3100 node server/webhook.mjs
```

결과:

- 성공
- `Webhook server listening on http://localhost:3100/webhook`

확인된 사실:

- 현재 프로젝트 경로 기준으로 서버가 정상 기동한다.
- `.env` 의 `ZOOM_WEBHOOK_SECRET_TOKEN`이 로드되고 있는 상태다.

### 2. health endpoint 확인

실행:

```bash
curl -i http://127.0.0.1:3100/health
```

결과:

- 성공
- `HTTP/1.1 200 OK`
- 응답 본문: `{ "ok": true }`

확인된 사실:

- 최소 health check 경로는 정상이다.

### 3. 서명 없는 webhook 요청 확인

실행:

```bash
curl -i -X POST http://127.0.0.1:3100/webhook \
  -H 'content-type: application/json' \
  --data '{"event":"meeting.participant_joined","payload":{"object":{"id":"123456789"}}}'
```

결과:

- 실패
- `HTTP/1.1 401 Unauthorized`
- 응답 본문: `missing signature headers`

확인된 사실:

- 현재 서버는 secret token 기준 서명 검증을 실제로 강제한다.
- Zoom에서 보내는 형태와 같은 서명 헤더가 필요하다.

### 4. 서명된 participant_joined 테스트 이벤트 확인

실행:

```bash
PORT=3100 npm run zoom:webhook
npm run zoom:webhook:test -- meeting.participant_joined
```

결과:

- 성공
- 테스트 스크립트 응답: `status: 200`
- 서버 로그에 다음 값이 출력됐다.
  - `event: meeting.participant_joined`
  - `meeting_id: 123456789`
  - `meeting_uuid: uuid-1`
  - `participant.user_id: u1`
  - `participant.user_name: Alice`
  - `participant.id: p1`

확인된 사실:

- 서명 검증을 통과한 일반 webhook 이벤트는 정상 수신된다.
- 현재 로그 구조로 meeting 식별자와 participant 객체를 바로 확인할 수 있다.

### 5. endpoint validation 확인

실행:

```bash
npm run zoom:webhook:test -- endpoint.url_validation
```

결과:

- 성공
- `status: 200`
- 응답 본문에 `plainToken`, `encryptedToken` 포함

확인된 사실:

- Zoom webhook endpoint validation 규약에 맞는 응답이 나온다.
- 현재 서버는 Zoom 앱 설정 화면의 endpoint validation 단계까지는 통과 가능한 구현 상태다.

## 이번 단계에서 확인된 사실

확정:

- 현재 프로젝트의 webhook 서버는 로컬 기준으로 정상 기동한다.
- `GET /health`는 정상 응답한다.
- `ZOOM_WEBHOOK_SECRET_TOKEN`이 설정된 경우 서명 없는 요청은 차단된다.
- Zoom 방식으로 서명된 일반 이벤트는 정상 수신된다.
- `endpoint.url_validation` 응답 형식은 구현돼 있고 로컬 테스트에서 정상 동작한다.

추정:

- 현재 Zoom 계정에서 `meeting.started`, `meeting.participant_joined`, `meeting.participant_left`, `meeting.ended`를 실제로 외부 endpoint로 전송할 수 있을 가능성이 높다.

미확정:

- 현재 Zoom 앱 설정에서 webhook endpoint 등록이 실제로 허용되는지
- 외부 공개 URL로 endpoint validation이 실제 통과하는지
- 실회의에서 `meeting.started`, `meeting.participant_joined`, `meeting.participant_left`, `meeting.ended` 네 가지 이벤트가 모두 도착하는지
- 실제 payload의 participant 식별자가 출결 요구사항을 만족하는지

## 결과 판정

현재 단계 판정:

- `B. 로컬 준비 완료, Zoom 실측 필요`

의미:

- 서버 구현 자체는 Step 03 실측을 진행할 수준까지 준비됐다.
- 아직 `실제 Zoom -> 외부 공개 endpoint` 구간은 검증되지 않았다.

## 다음 실측 절차

1. 공개 URL을 준비한다.
2. Zoom 앱의 Event Subscriptions에 `/webhook` endpoint를 등록한다.
3. `meeting.started`, `meeting.participant_joined`, `meeting.participant_left`, `meeting.ended` 이벤트를 구독한다.
4. 실제 회의를 열고 입장/퇴장 이벤트를 발생시킨다.
5. 서버 로그에 event 종류, meeting ID/UUID, participant 식별자가 어떻게 오는지 기록한다.

## 이번 단계 결론

현재 코드베이스 기준으로 webhook 서버 구현은 막혀 있지 않다.

막혀 있는 것은 `서버 구현`이 아니라 `실제 Zoom 외부 전달 경로 실측`이다.

따라서 다음 우선 작업은 공개 URL을 연결한 뒤 실제 Zoom 이벤트 4종이 들어오는지 확인하는 것이다.
