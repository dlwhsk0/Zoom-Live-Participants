# Step 07. Zoom webhook 미수신 점검

작성일:

- 2026-03-22

## 이번 단계 목적

Step 06까지 로컬 서버, 공개 URL, 이벤트 로그 저장 구조는 준비됐다.

하지만 실제 Zoom 회의에서 입/퇴장 이벤트를 발생시켜도 webhook 이벤트가 도착하지 않았다.

이번 단계 목적은 `현재 미수신 원인이 로컬 구현인지, Zoom 설정/전달 조건인지`를 분리해서 점검하는 것이다.

## 현재 점검 결과

### 1. 공개 URL 상태

확정:

- 등록된 endpoint:
  - `https://beer-gay-greatly-biographies.trycloudflare.com/webhook`
- `GET /health` 응답:
  - `HTTP/2 200`
- 즉, 공개 URL 자체는 살아 있다.

판독:

- 현재 시점 기준으로 `터널이 죽어서 못 받는 상태`는 아니다.

### 2. 로컬 서버 상태

확정:

- `node server/webhook.mjs` 가 3100 포트에서 listen 중이다.
- `/webhook`, `/events`, `/events.json` 모두 응답 가능하다.

판독:

- 현재 시점 기준으로 `로컬 서버 다운` 가능성은 낮다.

### 3. 로그 저장 상태

확정:

- webhook 수신 이벤트는 `logs/webhook-events.ndjson` 에 append 되도록 구현되어 있다.
- 테스트 이벤트는 실제로 파일에 저장됐다.
- `/events.json` 기준 저장 이벤트 수:
  - `total: 1`

판독:

- `파일 저장이 안 돼서 안 보이는 상태`는 아니다.
- 실제 Zoom 이벤트가 추가로 들어오지 않은 상태에 가깝다.

### 4. 현재 미수신 판정

현재 판정:

- `우리 쪽 수신 경로는 정상`
- `Zoom 쪽에서 실이벤트 전송이 안 되고 있을 가능성이 높음`

## Zoom 쪽 우선 점검 항목

### 1. 앱 Activation 상태

확정 근거:

- Zoom Developer Forum에서 Server-to-Server OAuth 앱의 meeting join/left webhook이 안 올 때
  Zoom 직원이 먼저 `Activation 탭에서 app이 Active인지 확인`하라고 안내했다.

점검 항목:

- Zoom App Marketplace
- 현재 앱
- `Activation`
- 상태가 `Active` 인지 확인

### 2. Event Subscriptions 저장 반영 여부

점검 항목:

- Event Subscriptions가 enabled 인지
- endpoint URL이 정확히 아래 값인지
  - `https://beer-gay-greatly-biographies.trycloudflare.com/webhook`
- 체크한 이벤트가 실제로 저장되어 있는지

필수 이벤트:

- `meeting.participant_joined`
- `meeting.participant_left`

선택 이벤트:

- `meeting.started`
- `meeting.ended`

### 3. 계정 범위 설정

점검 항목:

- 이벤트 수신 범위가 `All users in the account` 로 잡혀 있는지

판독:

- 이 값이 특정 사용자만 대상으로 잡혀 있으면, 기대한 회의에서 이벤트가 안 올 수 있다.

### 4. 회의 소유 계정 일치 여부

점검 항목:

- 지금 테스트한 24시간 회의가 `이 앱이 속한 같은 Zoom 계정`의 회의인지
- 호스트 계정이 다른 계정이면 이벤트가 안 올 수 있다.

### 5. Zoom Webhook/Event Logs 확인

점검 항목:

- Zoom 콘솔에 webhook delivery log 또는 event log가 보이면 다음을 확인
  - 아예 전송 시도가 없는지
  - 전송은 했는데 실패했는지
  - 실패라면 어떤 status/오류인지

판독:

- 전송 시도 없음:
  - 앱 활성화, 이벤트 선택, 계정 범위, 회의 소유 계정 문제 가능성 높음
- 전송 실패:
  - endpoint URL, 터널, 응답 코드 문제 가능성

## 공식/포럼 근거

1. Zoom Developer Forum
   `Event webhooks in OAuth are not firing`
   Zoom 직원 답변:
   Server-to-Server OAuth 앱이면 `Activation` 탭에서 앱이 Active인지 확인 필요
   https://devforum.zoom.us/t/event-webhooks-in-oauth-are-not-firing/90460

2. Zoom Developer Forum
   `Webhook App not triggering for all users (only the developer)`
   계정 레벨 앱에서 `all users in your account` 기준으로 이벤트를 받아야 한다는 취지의 답변
   https://devforum.zoom.us/t/webhook-app-not-triggering-for-all-users-only-the-developer/112409

3. Zoom Developer Forum
   `All event webhooks used by JWT app will not be triggered`
   endpoint가 public 이고 200 OK를 반환해야 하며 그렇지 않으면 webhook 전달이 실패할 수 있다는 안내
   https://devforum.zoom.us/t/all-event-webhooks-used-by-jwt-app-will-not-be-triggered/40317

## 현재 결론

현재 증거만 보면 로컬 구현보다 Zoom 앱 설정/전달 조건 쪽이 더 의심된다.

가장 먼저 볼 항목은 다음 순서다.

1. 앱이 `Active` 상태인지
2. Event Subscriptions 저장이 실제 반영됐는지
3. `All users in the account` 범위인지
4. 테스트한 회의가 같은 계정 소유인지
5. Zoom Webhook/Event Logs에 전송 시도가 있는지

## 다음 단계

다음 단계에서는 위 다섯 항목을 실제 Zoom 콘솔에서 확인하고 결과를 Step 08 문서로 남긴다.
