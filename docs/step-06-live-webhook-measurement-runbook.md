# Step 06. 실제 Zoom 입/퇴장 webhook 실측 런북

작성일:

- 2026-03-22

## 이번 단계 목적

Step 05까지는 공개 URL, 이벤트 구독 대상, scope 해석을 정리했다.

이번 단계 목적은 `실제 Zoom 회의 입/퇴장 이벤트를 수신하고 검증하는 실행 절차`를 작업 로그 관점에서 고정하는 것이다.

## 이번 단계에서 추가한 구현

추가/보완 파일:

- `server/webhook.mjs`
- `docs/step-06-live-webhook-measurement-runbook.md`

구현 내용:

- webhook 이벤트를 콘솔뿐 아니라 `logs/webhook-events.ndjson` 파일에도 append 하도록 보강
- 실제 실측 시 어떤 순서로 확인할지 런북 문서 추가

## 실측 전 준비 상태

현재 기준 확정:

- Zoom 앱에서 Event Subscriptions는 이미 활성화됨
- 공개 URL은 Cloudflare Quick Tunnel로 확보 가능함
- webhook 서버는 signature verification, endpoint validation을 처리함

현재 기준 미확정:

- 실제 Zoom 회의에서 `meeting.started`, `meeting.participant_joined`, `meeting.participant_left`, `meeting.ended`가 모두 도착하는지
- 실제 payload의 participant 식별자가 출결 요구사항에 충분한지

## 실행 절차

### 1. webhook 서버 실행

```bash
PORT=3100 node server/webhook.mjs
```

확인 포인트:

- `Webhook server listening on http://localhost:3100/webhook`
- 이후 실제 수신 이벤트는 `logs/webhook-events.ndjson`에 누적됨

### 2. Cloudflare Quick Tunnel 실행

```bash
cloudflared tunnel --url http://127.0.0.1:3100
```

확인 포인트:

- `https://...trycloudflare.com` URL 발급
- Zoom 콘솔 endpoint와 현재 URL이 일치하는지 확인

### 3. 공개 URL health 확인

```bash
curl -i https://<current-trycloudflare-domain>/health
```

성공 기준:

- `HTTP/2 200`
- `{ "ok": true }`

### 4. 로그 파일 초기 상태 확인

```bash
tail -n 20 logs/webhook-events.ndjson
```

확인 포인트:

- 기존 테스트 이벤트와 실제 이벤트를 구분할 수 있는지 확인
- 필요하면 실측 시작 시각을 메모

### 5. 실제 회의 이벤트 발생

실행:

1. 호스트가 회의를 시작한다.
2. 테스트 사용자가 회의에 입장한다.
3. 테스트 사용자가 회의에서 퇴장한다.
4. 호스트가 회의를 종료한다.

기대 이벤트:

- `meeting.started`
- `meeting.participant_joined`
- `meeting.participant_left`
- `meeting.ended`

### 6. 수신 로그 확인

```bash
tail -n 50 logs/webhook-events.ndjson
```

확인 포인트:

- 각 이벤트가 실제로 들어왔는지
- `meeting_id`, `meeting_uuid`가 어떤 값으로 오는지
- `participant.id`, `participant.user_id`, `participant.user_name`, `participant.email` 중 어떤 값이 채워지는지

## 판정 기준

성공:

- 네 가지 이벤트가 모두 수신된다.
- 입장/퇴장 이벤트에 participant 식별자가 들어온다.
- 같은 회의에 대해 `meeting_id`, `meeting_uuid` 관계를 설명할 수 있다.

부분 성공:

- 이벤트 일부만 온다.
- participant 식별자가 불완전하지만 최소 입퇴장 로그는 남는다.

실패:

- endpoint validation은 통과했지만 실제 이벤트가 오지 않는다.
- 이벤트는 오지만 participant 식별이 사실상 불가능하다.

## 수집해야 할 실측 메모

실측 후 문서에 남길 항목:

- 실측 시각
- 사용한 공개 URL
- 회의 ID
- 수신된 이벤트 목록
- 각 이벤트의 participant 식별자 유무
- 누락된 이벤트가 있는지
- 출결 추적용으로 충분한지에 대한 판정

## 이번 단계 결론

이 단계부터는 구현보다 `실제 이벤트 수신 증거 확보`가 중요하다.

따라서 다음 실제 작업은 회의를 열고 `logs/webhook-events.ndjson`에 남는 실측 결과를 기준으로 Step 07 결과 문서를 작성하는 것이다.
