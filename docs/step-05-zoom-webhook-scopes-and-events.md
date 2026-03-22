# Step 05. Zoom webhook 이벤트 구독과 scope 정리

작성일:

- 2026-03-22

## 이번 단계 목적

Cloudflare Quick Tunnel로 공개 URL 준비까지 끝났으므로, 다음은 Zoom 앱 설정 화면에서 `무엇을 구독해야 하는지`를 정확히 정리할 필요가 있다.

이번 단계 목적은 다음 두 가지를 분리해서 문서화하는 것이다.

- webhook 이벤트 수신 자체에 추가 scope가 필요한지
- REST API 호출에는 어떤 정확한 scope 이름이 필요한지

## 결론 요약

확정:

- `meeting.started`
- `meeting.ended`
- `meeting.participant_joined`
- `meeting.participant_left`

이 네 가지 webhook 이벤트를 Event Subscriptions에서 받기 위해서는 `별도의 REST API scope를 추가로 붙이는 것`이 필수 조건이라고 보기 어렵다.

- Zoom 측 안내 기준으로는 webhook 이벤트는 `Event Subscriptions`에서 해당 이벤트를 활성화하면 된다.

별도로 확정:

- live dashboard API, past participants API를 호출하려면 별도 REST API scope가 필요하다.
- 즉, `webhook 이벤트 구독`과 `REST API scope`는 같은 문제로 보면 안 된다.

## 1. webhook 이벤트 구독 자체

현재 Step 05 기준 권장 구독 이벤트:

- `meeting.started`
- `meeting.ended`
- `meeting.participant_joined`
- `meeting.participant_left`

확정:

- Zoom 직원 답변 기준으로 webhook 이벤트 사용 자체에 추가 scope는 필요하지 않다는 설명이 있다.
- 실무적으로는 Zoom 앱의 `Event Subscriptions`에서 이벤트를 체크하고 endpoint validation을 통과시키는 것이 우선이다.

근거:

- Zoom Developer Forum 답변:
  - “You shouldn’t need any additional scopes to use Webhook events. Simply enabling the event is all that is needed.”

판독:

- 현재 프로젝트의 다음 단계는 `scope 추가 작업`보다 `Event Subscriptions 연결 성공 여부` 확인이다.

## 2. REST API에 필요한 정확한 scope 이름

아래 scope는 webhook 이벤트 구독용이 아니라 `REST API 호출용`이다.

### 2-1. live meeting detail API

대상 API:

- `GET /metrics/meetings/{meetingId}?type=live`

확인된 scope:

- `dashboard_meetings:read:admin`
- `dashboard:read:admin`

granular scope:

- `dashboard:read:meeting:admin`

비고:

- 현재 계정에서는 scope 문제가 아니라 계정 플랜/대시보드 기능 제한으로 실패했다.

### 2-2. live participants API

대상 API:

- `GET /metrics/meetings/{meetingId}/participants?type=live`

확인된 scope:

- `dashboard_meetings:read:admin`
- `dashboard:read:admin`

granular scope:

- `dashboard:read:list_meeting_participants:admin`

비고:

- 현재 계정에서는 이 API도 Dashboard feature 제한으로 실패했다.

### 2-3. past participants API

대상 API:

- `GET /past_meetings/{meetingUUID}/participants`

확인된 scope:

- `meeting:read:admin`
- `meeting:read`

granular scope:

- `meeting:read:list_past_participants:admin`
- `meeting:read:list_past_participants`

비고:

- 현재 계정에서는 이 API도 Paid or ZMP account 제한으로 실패했다.

## 3. 현재 프로젝트 기준 해석

확정:

- 지금 당장 필요한 것은 webhook 이벤트 실측이다.
- 따라서 Zoom 앱 설정에서는 우선 `Event Subscriptions`를 열고 네 가지 meeting 이벤트를 체크하면 된다.

추정:

- Server-to-Server OAuth 앱에서 Event Subscriptions만 연결해도 현재 단계의 webhook 실측은 진행 가능할 가능성이 높다.

미확정:

- 현재 사용 중인 Zoom 앱 유형/설정 화면에서 특정 이벤트 선택 시 추가 제약이 나타나는지
- 실제 endpoint validation 이후 이벤트가 모두 전송되는지

## 4. 다음 실제 설정 체크리스트

1. Zoom App Marketplace에서 현재 사용하는 앱을 연다.
2. `Event Subscriptions`를 활성화한다.
3. endpoint URL에 현재 공개 URL의 `/webhook` 경로를 입력한다.
4. endpoint validation 통과 여부를 확인한다.
5. 아래 이벤트 4개를 체크한다.
6. 저장 후 실제 회의에서 이벤트 수신을 본다.

구독 대상 이벤트:

- `meeting.started`
- `meeting.ended`
- `meeting.participant_joined`
- `meeting.participant_left`

## 5. 출처

1. Zoom Developer Forum
   `Multitenant webhook endpoints, their scopes and permissions, and the developers who love them`
   https://devforum.zoom.us/t/multitenant-webhook-endpoints-their-scopes-and-permissions-and-the-developers-who-love-them/82105

2. Zoom Public Postman Workspace
   `Get meeting details`
   https://www.postman.com/zoom-developer/zoom-public-workspace/request/qzy7fnd/get-meeting-details

3. Zoom Public Postman Workspace
   `List meeting participants`
   https://www.postman.com/zoom-developer/zoom-public-workspace/request/65xet40/list-meeting-participants

4. Zoom Public Postman Workspace
   `Get past meeting participants`
   https://www.postman.com/zoom-developer/zoom-public-workspace/request/146rdqa/get-past-meeting-participants

## 이번 단계 결론

현재 프로젝트에서 `webhook 이벤트 구독`과 `REST API scope`를 섞어 보면 판단이 흐려진다.

이번 단계 기준 정리는 다음과 같다.

- webhook 실측: `Event Subscriptions`에서 이벤트 4개를 우선 구독
- REST API: 필요 scope 이름은 문서에 정리했지만, 현재 계정 제한 때문에 실사용은 막혀 있음

따라서 다음 단계는 Zoom 콘솔에서 endpoint validation과 실제 이벤트 수신을 확인하는 것이다.
