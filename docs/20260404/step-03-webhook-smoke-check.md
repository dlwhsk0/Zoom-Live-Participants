# Step 03. Webhook 스모크 체크

작성일:

- 2026-04-04

## 이번 단계 목적

이번 재검증에서는 예전 Step 03~07을 그대로 반복하지 않고, 새 앱 기준으로 webhook 경로가 최소한 정상인지 짧게 확인한다.

이번 단계에서 확인할 최소 항목:

- `GET /health`
- `endpoint.url_validation`

## 실행 결과

### 1. health 확인

실행:

```bash
curl -i http://127.0.0.1:3100/health
```

결과:

- 성공
- `HTTP/1.1 200 OK`
- 응답 본문: `{ "ok": true }`

판독:

- 로컬 webhook 서버는 새 앱 기준 환경에서도 정상 응답한다.

### 2. endpoint validation 확인

실행:

```bash
PORT=3100 npm run zoom:webhook:test -- endpoint.url_validation
```

결과:

- 성공
- `status: 200`
- 응답 본문에 `plainToken`, `encryptedToken` 포함

판독:

- 현재 `.env` 의 `ZOOM_WEBHOOK_SECRET_TOKEN` 기준으로 endpoint validation 응답이 정상 생성된다.
- 즉 새 앱 기준으로도 webhook 수신 준비 자체는 막혀 있지 않다.

## 이번 단계에서 확인된 사실

확정:

- 새 앱 기준으로도 로컬 webhook 서버는 정상 기동한다.
- health check 는 정상이다.
- `endpoint.url_validation` 응답 형식은 새 secret token 기준으로도 정상이다.

미확정:

- 실제 Zoom Event Subscriptions 연결이 새 앱 기준으로 통과하는지
- 실제 `meeting.participant_joined`, `meeting.participant_left` 이벤트가 도착하는지

## 결과 판정

현재 단계 판정:

- `B. webhook 준비 완료, 실측 필요`

## 이번 단계 결론

이번 재검증 기준으로 webhook 경로는 최소 준비가 끝났다.

따라서 다음 단계는 실제 Zoom 입/퇴장 이벤트 실측이다.
