# Step 01. Zoom Live Dashboard API 실측

작성일:

- 2026-03-22

## 이번 단계 목적

이번 단계의 목적은 Zoom에서 `회의 진행 중 현재 참가자 전체 목록`을 REST API로 조회할 수 있는지 실측하는 것이다.

검증 대상:

- `GET /metrics/meetings/{meetingId}?type=live`
- `GET /metrics/meetings/{meetingId}/participants?type=live`

## 실행 전 가설

가설:

- 현재 회의가 Zoom Dashboard의 `live meeting`으로 잡히면
- `live participants` API가 현재 참가자 목록을 반환할 수 있다.

전제:

- Server-to-Server OAuth 토큰 발급이 가능해야 한다.
- 계정 플랜과 Dashboard 기능이 이 API를 지원해야 한다.

## 사용한 파일

- `scripts/getAccessToken.mjs`
- `scripts/getLiveMeeting.mjs`
- `scripts/getLiveParticipants.mjs`

## 실행 명령

```bash
npm run zoom:token
npm run zoom:meeting
npm run zoom:participants
```

## 실행 결과

### 1. Access token 발급

결과:

- 성공

의미:

- Server-to-Server OAuth 앱 자격증명은 정상이다.
- 최소한 API 인증 단계는 통과했다.

### 2. live meeting 조회

실행:

```bash
npm run zoom:meeting
```

응답:

```text
status: 400
url: https://api.zoom.us/v2/metrics/meetings/2498511381?type=live
message: This API is only available for ZMP and Business or higher accounts that have enabled the Dashboard feature.
```

판독:

- 현재 계정에서는 live Dashboard meeting API를 사용할 수 없다.

### 3. live participants 조회

실행:

```bash
npm run zoom:participants
```

응답:

```text
status: 400
url: https://api.zoom.us/v2/metrics/meetings/2498511381/participants?type=live&page_size=300
message: This API is only available for ZMP and Business or higher accounts that have enabled the Dashboard feature.
```

판독:

- 현재 계정에서는 live Dashboard participants API도 사용할 수 없다.

## 이번 단계에서 확인된 사실

확정:

- OAuth 토큰 발급은 정상 동작한다.
- 현재 계정은 `live meeting`, `live participants` Dashboard API를 사용할 수 없다.
- 실패 원인은 `meeting ID 오입력`보다 `계정 플랜/대시보드 기능 제한`에 가깝다.

아직 미확정:

- Business 이상 + Dashboard enabled 계정에서는 같은 코드가 동작하는지
- 24시간 회의 유형에서 UUID/instance가 어떻게 잡히는지
- live participants 응답에서 participant 식별자가 실제로 어떻게 내려오는지

## 결과 판정

현재 계정 기준 판정:

- `C. 사실상 사용할 수 없음`

이 판정의 의미:

- 현재 계정 조건에서는 프로젝트의 핵심 요구사항인 `현재 시점 전체 참가자 목록 조회`를 만족할 수 없다.
- 따라서 이 계정으로는 live participants API 기반 접근을 계속 밀어붙이면 안 된다.

## 요구사항 영향

현재 계정 조건이 유지된다면 요구사항은 아래 중 하나로 바뀌어야 한다.

1. `현재 전체 참가자 목록` 요구를 포기하고 webhook 기반 추정 상태만 제공
2. `회의 종료 후 출결`만 제공
3. 정확한 현재 참가자 목록이 필수라면 Business 이상 계정 또는 다른 Zoom 통합 방식으로 재설계

## 다음 단계 후보

### 후보 A. 대체 검증 진행

목표:

- 현재 계정으로 가능한 범위를 확인한다.

검증 후보:

- `meeting.participant_joined`
- `meeting.participant_left`
- 종료 후 `past participants`

의의:

- live snapshot은 안 되더라도
- 웹훅 기반 상태 추정 또는 종료 후 출결 프로젝트로는 갈 수 있는지 판단 가능하다.

### 후보 B. 계정 조건 변경 후 재검증

목표:

- Business 이상 + Dashboard enabled 계정에서 동일한 스크립트를 다시 실행한다.

의의:

- 이 경우 현재 코드베이스를 거의 그대로 재사용할 수 있다.

## 이번 단계 결론

이번 단계의 결론은 명확하다.

- Zoom live participants API 자체는 후보였지만
- 현재 계정에서는 Dashboard 권한 제한으로 실사용 불가다.
- 따라서 `현재 회의 참가자 전체 목록을 REST API로 바로 읽는 방식`은 지금 계정 기준으로 채택하면 안 된다.

이 단계는 실패가 아니라 핵심 가설을 빠르게 배제한 검증 단계로 본다.
