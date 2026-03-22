# Zoom 실시간 참가자 목록 검증 메모

## 현재 상태 요약

2026-03-22 기준 확정:

- `zoom:token` 성공
- `GET /metrics/meetings/{meetingId}?type=live` 실패
- `GET /metrics/meetings/{meetingId}/participants?type=live` 실패
- `GET /past_meetings/{meetingId}/instances` 성공
- `GET /past_meetings/{meetingUUID}/participants` 실패
- webhook 서버의 로컬 서명 검증, 일반 이벤트 수신, `endpoint.url_validation` 응답은 성공

현재 판정:

- REST API 기준으로는 live participants, past participants 모두 사용할 수 없다.
- webhook 경로는 로컬 준비가 끝났고, 다음 검증은 `실제 Zoom -> 공개 endpoint` 실측이다.

## 목적

이번 단계의 목적은 Zoom에서 `회의 진행 중 현재 참가자 전체 목록`을 서버에서 읽을 수 있는지 검증하는 것이다.

핵심은 이벤트 수집이 아니라 `현재 시점 snapshot` 가능 여부다.

이번 단계에서는 다음 질문에 답할 수 있어야 한다.

1. 회의 진행 중 participants 조회 API가 현재 참가자 목록을 반환하는가?
2. 내가 사용하는 24시간 열려 있는 Zoom 회의 유형에서도 동작하는가?
3. `meeting ID`, `meeting UUID`, `participant 식별자`는 어떻게 잡히는가?
4. 이 API가 안 되면 프로젝트 요구사항은 어떻게 바뀌어야 하는가?

## 범위

이번 단계는 구현보다 검증이 우선이다.

이번 단계에서 하지 않는 것:

- 배포
- Docker
- DB
- 프론트엔드
- 인증 고도화
- 완성형 앱 구조 설계

## 핵심 가설

가설 1.
Zoom에는 `회의 진행 중 현재 참가자 목록`을 조회하는 REST API가 있다.
후보는 Dashboard 계열의 `GET /metrics/meetings/{meetingId}/participants?type=live`다.

가설 2.
내가 사용하는 24시간 열려 있는 회의도 Zoom 내부에서 `현재 live meeting instance`로 잡히면 이 API로 조회 가능하다.

가설 3.
`participant_joined`, `participant_left` 웹훅만으로는 `현재 시점 전체 참가자 목록`을 정확히 복원할 수 없다.
따라서 이 프로젝트의 핵심은 `live participants API`가 실제로 되는지 검증하는 것이다.

## 확정 / 추정 구분

### 확정

- 공개 참조 기준 `GET /metrics/meetings/{meetingId}/participants` 엔드포인트가 존재한다.
- 위 엔드포인트는 `type=live`를 지원하는 것으로 보인다.
- `participant_joined`, `participant_left` 웹훅 이벤트가 존재한다.
- `GET /past_meetings/{meetingUUID}/participants` 엔드포인트가 별도로 존재한다.
- `meeting ID`와 `meeting UUID`는 다르며, past 계열은 UUID 기준으로 다루는 경우가 많다.

### 추정

- 내가 쓰는 24시간 회의가 Dashboard `live meeting`으로 안정적으로 조회될지
- 현재 회의에서 `meeting ID`만으로 충분한지, 아니면 현재 instance의 `UUID`를 반드시 잡아야 하는지
- 참가자 응답의 `user_name`, `email`, `user_id`가 외부 참가자까지 안정적으로 채워질지
- 계정 플랜/앱 권한에 따라 live participants API 접근이 제한되는지

위 항목은 문서만으로 확정하지 않고 실제 호출로 검증해야 한다.

## 성공 조건

- 회의가 진행 중일 때 API 호출 1회로 현재 참가자 목록 배열이 반환된다.
- 참가자 입장/퇴장 직후 재호출 결과가 실제 Zoom 화면과 대체로 일치한다.
- 24시간 열려 있는 실제 회의에서도 같은 방식이 재현된다.
- `meeting ID`, `UUID`, participant 식별자 관계를 설명할 수 있다.

## 실패 조건

- live participants API 자체를 사용할 수 없다.
- 호출은 되지만 항상 빈 결과이거나 실제 참가자와 맞지 않는다.
- 24시간 회의에서 현재 회의 instance 식별이 불안정하다.
- 웹훅만 오고 `현재 전체 목록` API는 실질적으로 쓸 수 없다.

## 확인해야 할 Zoom 사실들

### 1. participants 조회 API

검증 대상:

- `GET /metrics/meetings/{meetingId}/participants?type=live`

확인할 내용:

- 실제로 현재 참가자 전체 목록을 반환하는가
- 회의 진행 중 호출 가능한가
- 참가자 수가 Zoom UI와 일치하는가
- 응답 필드 중 어떤 식별자를 실사용 가능한가

### 2. 24시간 회의 유형

검증 대상:

- 내가 사용하는 실제 상시 회의

확인할 내용:

- Zoom이 이 회의를 `live meeting`으로 노출하는가
- 회의가 오래 지속되어도 동일한 식별 방식으로 추적 가능한가
- 같은 `meeting ID`로 계속 조회 가능한가
- 중간에 `UUID`가 바뀌거나 instance가 분리되는가

### 3. 식별자 구조

확인 대상:

- `meeting ID`
- `meeting UUID`
- participants 응답의 `id`
- participants 응답의 `user_id`
- participants 응답의 `user_name`
- webhook payload 내 participant 관련 식별자

확인할 내용:

- 어느 값이 회의 단위 식별자인가
- 어느 값이 현재 instance 단위 식별자인가
- webhook과 participants API 결과를 어떤 키로 매핑할 수 있는가

### 4. API 불가 시 요구사항 변경

만약 live participants API를 못 쓰면 다음 중 하나로 요구사항을 바꿔야 한다.

- `현재 전체 참가자 목록` 요구를 포기하고 웹훅 기반 추정 상태만 제공
- `회의 종료 후 출결`만 제공
- 정확한 현재 목록이 반드시 필요하면 Zoom App / Meeting SDK / 봇 참여 구조로 재설계

## 웹훅과 participants 조회의 차이

### `participant_joined` / `participant_left`로 확인 가능한 것

- 참가자 입장/퇴장 이벤트 발생 여부
- 이벤트 시각
- 이벤트 스트림 기준의 상태 변화

### `participant_joined` / `participant_left`로 확인 불가능한 것

- 서버가 늦게 켜졌을 때 이미 들어와 있던 전체 현재 목록
- 이벤트 누락 시 정확한 현재 상태
- 현재 시점 전체 참가자 snapshot

### live participants API로 확인 가능한 것

- 현재 시점 참가자 전체 목록
- 참가자 증감 직후 snapshot 변화
- `meeting ID` 또는 `UUID` 기준 조회 가능 여부

### live participants API로도 검증이 필요한 것

- 반영 지연
- 외부 참가자 정보 마스킹 여부
- 24시간 회의에서 instance 안정성

## 최소 기술 선택

추천 스택:

- Node.js 20+
- 내장 `fetch`
- 내장 `http` 서버
- 필요하면 `.env` 로딩용 최소 의존성 1개

이유:

- 이번 단계는 토큰 발급, REST 호출, 웹훅 수신 로그만 있으면 된다.
- 무거운 프레임워크가 필요 없다.
- CLI 출력과 JSON 로그만으로 검증 가능하다.

## 필요한 Zoom 준비물

### 앱 유형

우선 후보:

- Server-to-Server OAuth 앱

이유:

- 브라우저 사용자 로그인보다 서버에서 계정 단위 API를 호출하는 실험에 가깝다.

주의:

- 최신 Zoom 앱 생성 절차와 허용 범위는 실제 계정 상태 기준으로 다시 확인해야 한다.
- 이 부분은 `검증 필요`다.

### 권한(scope)

최소 후보:

- `dashboard_meetings:read:admin` 또는 최신 동등 granular scope
- 필요 시 `meeting:read:admin` 또는 past participants 조회용 동등 scope

주의:

- 실제 필요한 최소 scope는 Zoom 앱 설정 화면에서 한 번 더 확인해야 한다.
- scope 이름이 최신 콘솔에서 다를 수 있으므로 `검증 필요`.

### 웹훅 이벤트

최소 후보:

- `meeting.started`
- `meeting.ended`
- `meeting.participant_joined`
- `meeting.participant_left`

### 회의 식별자

실험 중 반드시 확보할 값:

- 내 실제 상시 회의의 `meeting ID`
- 해당 회의의 현재 `meeting UUID`
- 웹훅 payload의 meeting 식별자
- participants API 응답의 participant 식별자

## 최소 실험 구조

이번 단계의 목표는 검증 속도와 단순함이다.

권장 구조:

- `scripts/getAccessToken.mjs`
- `scripts/getLiveMeeting.mjs`
- `scripts/getLiveParticipants.mjs`
- `scripts/getPastParticipants.mjs`
- `server/webhook.mjs`

프론트엔드는 생략한다.

출력 형태:

- CLI 콘솔 출력
- 필요하면 단순 JSON 응답

## 검증용 구현 범위

이번 단계에서 구현할 최소 범위:

1. Zoom access token 발급 스크립트
2. live meeting detail 조회 스크립트
3. live participants 조회 스크립트
4. past participants 비교 스크립트
5. webhook 수신 최소 서버
6. 로그 출력

이번 단계에서 구현하지 않을 것:

- DB 저장
- 장기 상태 동기화
- 관리자 UI
- 출결 계산 로직
- 배포용 설정

## 테스트 절차

### 1. Zoom 앱 준비

절차:

- Server-to-Server OAuth 앱 생성
- 필요한 scope 추가
- webhook 이벤트 구독 설정
- access token 발급 확인

기대 결과:

- access token이 정상 발급된다.
- webhook endpoint 등록이 가능하다.

실패 시 의심 원인:

- 계정 플랜 부족
- owner/admin 권한 부족
- scope 누락
- webhook validation 실패

### 2. 실제 24시간 회의 식별

절차:

- 실제 사용하는 상시 회의를 열어 둔다.
- `GET /metrics/meetings/{meetingId}?type=live` 또는 live meetings 조회로 현재 회의를 찾는다.

기대 결과:

- 현재 회의의 `id`, `uuid`, `topic`, `participants`를 확인할 수 있다.

실패 시 의심 원인:

- 해당 회의가 Dashboard의 live meeting으로 노출되지 않음
- meeting ID가 현재 instance를 가리키지 않음
- 플랜/권한 문제

### 3. 참가자 1명 입장

절차:

- 테스트 참가자 A 입장
- webhook 로그 확인
- live participants API 즉시 호출

기대 결과:

- `participant_joined` 이벤트가 보인다.
- participants 응답에 현재 참가자가 반영된다.

실패 시 의심 원인:

- webhook 지연
- API 반영 지연
- meeting 식별자 오류
- 외부 참가자 필드 제한

### 4. 참가자 2명 입장

절차:

- 테스트 참가자 B 추가 입장
- webhook 로그와 participants 결과 비교

기대 결과:

- join 이벤트가 추가된다.
- participants 배열 길이가 증가한다.

실패 시 의심 원인:

- 반영 지연
- 동일 회의 instance 미매칭
- 외부 참가자 정보 공란

### 5. 참가자 1명 퇴장

절차:

- 테스트 참가자 A 퇴장
- `participant_left` 이벤트 확인
- live participants 재호출

기대 결과:

- left 이벤트가 수신된다.
- 현재 참가자 목록에서 A가 제거된다.

실패 시 의심 원인:

- 이벤트 누락 또는 지연
- API snapshot 지연
- 참가자 식별자 매핑 실패

### 6. 장시간 유지 상태 확인

절차:

- 회의를 일정 시간 계속 유지한 뒤 다시 live participants 호출

기대 결과:

- 같은 방식으로 현재 참가자 목록이 계속 조회된다.

실패 시 의심 원인:

- 회의 instance 변경
- UUID 변경
- 호스트 재연결에 따른 내부 세션 분리

### 7. 종료 후 past participants 비교

절차:

- 회의 종료 후 `GET /past_meetings/{meetingUUID}/participants` 호출
- live 시점 결과와 비교

기대 결과:

- 종료 후 출결 목록과 live snapshot이 대체로 정합하다.

실패 시 의심 원인:

- past data 반영 지연
- 잘못된 UUID 사용
- UUID 인코딩 문제

## 결과 판정 기준

### A. 회의 중 participants API가 정상 동작함

판정 기준:

- live participants API가 현재 참가자 목록을 반환한다.
- 참가자 증감이 실제 회의와 일치한다.
- 24시간 회의에서도 재현된다.

다음 단계:

- `snapshot API + webhook delta` 구조로 설계 진행

### B. 동작은 하지만 지연/제약/누락이 있음

판정 기준:

- API는 되지만 반영 지연, 정보 공란, 일부 누락, 식별자 불안정이 있다.

다음 단계:

- 요구사항을 `현재 전체 목록 추정` 수준으로 낮춘다.
- polling + webhook 보강 전략을 검토한다.
- participant 식별 규칙을 먼저 정한다.

### C. 사실상 사용할 수 없음

판정 기준:

- API 접근 자체가 안 되거나, 실사용 가능한 결과가 나오지 않는다.

다음 단계:

- 요구사항 변경 필요
- 웹훅 기반 추정 상태만 제공
- 또는 종료 후 출결만 제공
- 정확한 현재 목록이 필수라면 다른 Zoom 통합 방식으로 재설계

## 바로 만들 파일 목록

- `package.json`
- `.env.example`
- `scripts/getAccessToken.mjs`
- `scripts/getLiveMeeting.mjs`
- `scripts/getLiveParticipants.mjs`
- `scripts/getPastParticipants.mjs`
- `server/webhook.mjs`
- `README.md`

## 첫 구현 순서

### 1단계

먼저 아래 5개만 만든다.

1. `package.json`
2. `.env.example`
3. `scripts/getAccessToken.mjs`
4. `scripts/getLiveMeeting.mjs`
5. `scripts/getLiveParticipants.mjs`

이 단계에서 바로 확인할 수 있는 것:

- live participants API 자체 접근 가능 여부
- 실제 상시 회의가 live meeting으로 조회되는지
- 최소한의 현재 참가자 snapshot이 나오는지

## 현재 구현 상태

현재 아래 파일까지 생성되어 있다.

- `package.json`
- `.env.example`
- `scripts/getAccessToken.mjs`
- `scripts/getLiveMeeting.mjs`
- `scripts/getLiveParticipants.mjs`
- `scripts/getPastParticipants.mjs`
- `server/webhook.mjs`
- `README.md`

로컬 구문 점검 기준으로 스크립트들은 모두 실행 가능한 형태다.

## 바로 실행할 명령

`.env`를 채운 뒤 아래 순서로 실행한다.

```bash
npm run zoom:token
npm run zoom:meeting
npm run zoom:participants
```

회의가 끝난 뒤 past 비교가 필요하면:

```bash
node scripts/getPastParticipants.mjs "<meeting-uuid>"
```

## 1차 실측 결과

실행 날짜:

- 2026-03-22

실행 결과:

- `npm run zoom:token` 성공
- `npm run zoom:meeting` 실패
- `npm run zoom:participants` 실패

실제 응답:

```text
status: 400
message: This API is only available for ZMP and Business or higher accounts that have enabled the Dashboard feature.
```

해석:

- 현재 계정/플랜에서는 Dashboard 기반 `live meeting`, `live participants` API를 사용할 수 없다.
- 즉, 지금 계정 조건에서는 `회의 진행 중 현재 참가자 전체 목록 조회` 검증을 계속 진행할 수 없다.
- 이번 실패는 `meeting ID 오입력`이나 `scope 누락`보다 계정 기능 제한으로 보는 것이 맞다.

현재 판정:

- 판정 등급 `C`에 가깝다.
- 단, 이건 `현재 계정 조건에서 사실상 사용 불가`라는 의미다.
- Business 이상 + Dashboard enabled 계정으로 바꾸면 같은 코드로 재검증할 가치는 있다.

즉시 후속 선택지:

1. Business 이상 계정에서 같은 스크립트로 재검증
2. 현재 계정으로는 webhook 기반 접근 또는 종료 후 past participants 기반으로 요구사항 축소

## 참고

외부 문서 기준으로는 live participants용 Dashboard API가 존재하는 정황이 있으나,
이번 프로젝트에서는 문서 신뢰보다 실제 호출 결과를 우선한다.

따라서 이후 작업도 항상 아래 순서로 진행한다.

1. 실제 호출
2. 응답 캡처
3. Zoom 화면과 비교
4. 그 다음에만 구조 설계
