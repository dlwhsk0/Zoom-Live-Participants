# Step 02. REST 대체 경로 재검증

작성일:

- 2026-04-04

## 이번 단계 목적

Step 01에서 새 계정 기준으로 Dashboard live participants API가 막혀 있다는 점은 다시 확인됐다.

이번 단계 목적은 `REST 기준 대체 경로`가 새 계정에서는 어디까지 열리는지 짧게 다시 확인하는 것이다.

검증 대상:

- `GET /past_meetings/{meetingId}/instances`
- `GET /past_meetings/{meetingUUID}/participants`

## 실행 명령

past meeting instances 조회:

```bash
npm run zoom:past-instances
```

past participants 조회:

```bash
node scripts/getPastParticipants.mjs "89791995600"
```

## 실행 결과

### 1. past meeting instances 조회

결과:

- 실패
- `status: 400`

응답:

```text
message: Invalid access token, does not contain scopes:[meeting:read:list_past_instances, meeting:read:list_past_instances:admin].
```

판독:

- 이번 새 계정의 토큰에는 `past instances` 조회 scope가 없다.
- 예전 계정처럼 플랜 제한까지 가기 전에 scope 단계에서 먼저 막힌다.

### 2. past participants 조회

결과:

- 실패
- `status: 400`

응답:

```text
message: Invalid access token, does not contain scopes:[meeting:read:list_past_participants, meeting:read:list_past_participants:admin].
```

판독:

- 이번 새 계정의 토큰에는 `past participants` 조회 scope도 없다.
- 현재 상태에서는 past participants는 플랜 이전에 scope 단계에서 먼저 불가다.

## 이번 단계에서 확인된 사실

확정:

- 새 계정은 `past instances`, `past participants` 모두 현재 scope 구성이 부족하다.
- 즉 새 계정은 Step 02 시점에서 REST 대체 경로도 바로 사용할 수 없다.

추정:

- 새 앱에 `meeting:read:list_past_instances:admin`, `meeting:read:list_past_participants:admin` scope를 추가하면 past 계열은 다시 검증 가능할 수 있다.

미확정:

- scope를 추가한 뒤에도 Pro 계정 제한 때문에 `past participants`가 막히는지
- webhook 이벤트 수신 경로는 새 계정에서 정상 동작하는지

## 결과 판정

현재 계정 기준 판정:

- `REST 대체 경로도 현 상태 그대로는 불가`

의미:

- live snapshot 경로는 계정 플랜 제한으로 불가
- past 경로는 현재 scope 구성 부족으로 불가

즉, 지금 상태에서는 REST만으로 프로젝트 요구사항을 만족할 수 없다.

## 다음 단계

현실적인 다음 우선순위:

1. webhook 수신 준비를 최소 범위로 다시 확인한다.
2. 필요하면 나중에 앱 scope를 추가해 past 계열 REST 경로를 재검증한다.

## 이번 단계 결론

2026-04-04 새 계정 기준 Step 02 결론은 다음과 같다.

- live Dashboard API: 계정 플랜 제한으로 불가
- past REST API: 현재 scope 부족으로 불가

따라서 다음 단계는 압축된 `webhook 스모크 체크`가 맞다.
