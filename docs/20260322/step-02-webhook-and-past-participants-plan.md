# Step 02. Webhook + Past Participants 검증

작성일:

- 2026-03-22

## 이번 단계 목적

Step 01에서 현재 계정으로는 Dashboard 기반 live participants API를 사용할 수 없다는 점이 확인됐다.

이번 단계의 목적은 `현재 계정으로 가능한 대체 검증 경로`가 실제로 어디까지 열리는지 확인하는 것이다.

대체 검증 대상:

- `meeting.participant_joined` 웹훅
- `meeting.participant_left` 웹훅
- `GET /past_meetings/{meetingId}/instances`
- `GET /past_meetings/{meetingUUID}/participants`

## 이번 단계에서 추가한 구현

추가/보완 파일:

- `scripts/getPastMeetingInstances.mjs`
- `server/webhook.mjs`
- `package.json`
- `README.md`

구현 내용:

- 종료된 회의 instance 목록 조회 스크립트 추가
- webhook 서버에 `GET /health` 추가
- webhook endpoint validation 시 secret token 누락 체크 추가
- 실행 명령 문서 업데이트

## 실행한 검증

### 1. past meeting instances 조회

실행:

```bash
npm run zoom:past-instances
```

결과:

- 성공
- `status: 200`
- `GET /past_meetings/{meetingId}/instances` 응답 수신

확인된 사실:

- 현재 계정에서도 meeting ID 기준으로 `종료된 회의 instance 목록`은 조회 가능하다.
- 즉, `meeting UUID 확보` 자체는 가능하다.
- 응답에는 다수의 `uuid`, `start_time`이 포함됐다.

### 2. past participants 조회

실행:

```bash
node scripts/getPastParticipants.mjs "zmJJ9HSIQh6BLjDXcHcJ9A=="
```

결과:

- 실패
- `status: 400`

실제 응답:

```text
message: Only available for Paid or ZMP account: 4ezLDWP3R2yUqidBkIlnsw.
```

확인된 사실:

- 현재 계정에서는 `GET /past_meetings/{meetingUUID}/participants`도 사용할 수 없다.
- 즉, 종료 후 참가자 목록 조회 역시 현재 계정에서 막혀 있다.

## 이번 단계에서 확인된 사실

확정:

- 현재 계정은 `past meeting instances` 조회는 가능하다.
- 현재 계정은 `past participants` 조회는 불가능하다.
- 따라서 REST API 기준으로는 `live participants`도 안 되고 `past participants`도 안 된다.

미확정:

- webhook 이벤트는 현재 계정에서 정상 수신 가능한지
- webhook payload의 participant 식별자가 출결 수준 요구사항을 만족하는지
- Paid 계정으로 바꾸면 `past participants`가 정상 동작하는지

## 결과 판정

현재 계정 기준 판정:

- REST API 기반 참가자 목록 조회는 `C. 사실상 사용할 수 없음`

세부 해석:

- live snapshot 경로: 불가
- 종료 후 participants 경로: 불가
- 종료된 회의 UUID 조회만 가능

즉, 현재 계정에서는 REST API만으로 이 프로젝트 요구사항을 만족시킬 수 없다.

## 요구사항 영향

현재 계정이 유지된다면 남는 현실적인 선택지는 둘뿐이다.

1. webhook 기반 이벤트 수집으로 `추정 상태` 또는 `이벤트 로그` 중심으로 간다.
2. Paid / Business 계정으로 바꾼 뒤 같은 스크립트로 재검증한다.

## 다음 단계 제안

### Step 03 후보 A. Webhook 실측

목표:

- `meeting.started`
- `meeting.participant_joined`
- `meeting.participant_left`
- `meeting.ended`

를 실제로 수신하는지 검증한다.

이 단계에서 답할 질문:

- 현재 계정에서 webhook 이벤트는 받을 수 있는가
- participant 식별자가 실사용 가능한가
- 웹훅만으로 최소한의 출입 로그 프로젝트는 가능한가

### Step 03 후보 B. Paid 계정 재검증

목표:

- 같은 코드로 `past participants`, 필요 시 `live participants`를 다시 검증한다.

## 이번 단계 결론

이번 단계 결과로 현재 계정의 REST 경계가 더 명확해졌다.

- `past_meetings/{meetingId}/instances`: 가능
- `past_meetings/{meetingUUID}/participants`: 불가
- `metrics/meetings/.../participants?type=live`: 불가

따라서 다음 단계는 사실상 `webhook 실측`이 우선이다.
