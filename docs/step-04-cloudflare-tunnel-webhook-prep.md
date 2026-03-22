# Step 04. Cloudflare Quick Tunnel 공개 URL 준비

작성일:

- 2026-03-22

## 이번 단계 목적

Step 03까지는 webhook 서버가 로컬에서 정상 동작하는지 확인했다.

이번 단계 목적은 `Zoom Event Subscriptions에 넣을 수 있는 공개 HTTPS URL`을 실제로 준비하는 것이다.

검증 대상:

- `cloudflared` 설치 가능 여부
- Cloudflare Quick Tunnel 공개 URL 발급 가능 여부
- 공개 URL의 `/health` 응답
- 공개 URL의 `/webhook` 경유 `endpoint.url_validation` 응답

## 이번 단계에서 추가한 정리

추가/보완 파일:

- `.env.example`
- `README.md`
- `docs/step-04-cloudflare-tunnel-webhook-prep.md`

정리 내용:

- `ZOOM_WEBHOOK_LOCAL_URL` 예시 추가
- `cloudflared tunnel --url` 실행 절차 추가
- 공개 URL 경유 검증 절차 문서화

## 실행한 검증

### 1. cloudflared 설치 확인

실행:

```bash
brew install cloudflared
cloudflared --version
```

결과:

- 성공
- 설치 버전: `2026.3.0`

확인된 사실:

- 현재 로컬 환경에서 Cloudflare Quick Tunnel을 바로 사용할 수 있다.

### 2. webhook 서버 실행

실행:

```bash
PORT=3100 node server/webhook.mjs
```

결과:

- 성공
- `Webhook server listening on http://localhost:3100/webhook`

### 3. Cloudflare Quick Tunnel 생성

실행:

```bash
cloudflared tunnel --url http://127.0.0.1:3100
```

결과:

- 성공
- 발급 URL:

```text
https://beer-gay-greatly-biographies.trycloudflare.com
```

확인된 사실:

- 현재 로컬 webhook 서버에 연결된 공개 HTTPS URL을 즉시 만들 수 있다.
- 이 URL은 Quick Tunnel이므로 임시 주소다.

### 4. 공개 URL health 확인

실행:

```bash
curl -i https://beer-gay-greatly-biographies.trycloudflare.com/health
```

결과:

- 성공
- `HTTP/2 200`
- 응답 본문: `{ "ok": true }`

확인된 사실:

- Cloudflare 공개 URL이 로컬 서버의 `/health`까지 정상 전달된다.

### 5. 공개 URL 경유 endpoint validation 확인

실행:

```bash
PORT=3100 \
ZOOM_WEBHOOK_LOCAL_URL=https://beer-gay-greatly-biographies.trycloudflare.com/webhook \
npm run zoom:webhook:test -- endpoint.url_validation
```

결과:

- 성공
- `status: 200`
- 응답 본문에 `plainToken`, `encryptedToken` 포함

확인된 사실:

- 공개 URL을 거쳐도 Zoom webhook validation 응답 규약이 유지된다.
- Zoom 앱의 Event Subscriptions에 넣을 endpoint 후보로 사용할 수 있다.

## 이번 단계에서 확인된 사실

확정:

- `cloudflared`는 현재 로컬 환경에 설치됐다.
- `cloudflared tunnel --url http://127.0.0.1:3100` 으로 공개 HTTPS URL 발급이 가능하다.
- 발급된 공개 URL은 `/health` 요청을 로컬 서버로 전달한다.
- 발급된 공개 URL은 `/webhook` 경유 `endpoint.url_validation` 응답도 정상 전달한다.

추정:

- 동일한 공개 URL을 Zoom Event Subscriptions endpoint로 등록하면 endpoint validation을 통과할 가능성이 높다.

미확정:

- Zoom 앱 설정 화면에서 실제 endpoint validation이 통과하는지
- 실제 회의에서 `meeting.started`, `meeting.participant_joined`, `meeting.participant_left`, `meeting.ended` 이벤트가 모두 도착하는지
- Quick Tunnel 임시 URL이 실측 중간에 바뀌거나 끊기지 않는지

## 결과 판정

현재 단계 판정:

- `A. 공개 URL 준비 완료`

의미:

- 다음 단계부터는 Zoom 앱 설정 화면에서 Event Subscription을 실제로 연결해볼 수 있다.
- 더 이상 공개 URL 준비가 병목은 아니다.

## 다음 실측 절차

1. `PORT=3100 node server/webhook.mjs` 실행
2. `cloudflared tunnel --url http://127.0.0.1:3100` 실행
3. 발급된 `https://...trycloudflare.com/webhook` 를 Zoom Event Subscriptions endpoint에 입력
4. endpoint validation 통과 여부 기록
5. `meeting.started`, `meeting.participant_joined`, `meeting.participant_left`, `meeting.ended` 이벤트를 구독
6. 실제 회의를 열고 입장/퇴장 이벤트를 발생시켜 서버 로그를 기록

## 이번 단계 결론

`ngrok` 없이도 현재 환경에서 Cloudflare Quick Tunnel만으로 Zoom webhook 실측을 시작할 수 있다.

다음 단계의 핵심은 공개 URL 준비가 아니라 `Zoom 콘솔에서 실제 Event Subscription이 붙는지` 확인하는 것이다.
