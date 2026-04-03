# Step 01. Zoom Live Dashboard API 재실측

작성일:

- 2026-04-04

## 이번 단계 목적

새 Zoom 앱 자격증명과 새 회의 ID `89791995600` 기준으로 Dashboard live meeting / live participants API를 다시 검증한다.

검증 대상:

- `GET /metrics/meetings/{meetingId}?type=live`
- `GET /metrics/meetings/{meetingId}/participants?type=live`

## 실행 환경

확정:

- `.env` 에 새 Zoom 앱 자격증명이 설정되어 있다.
- `.env` 에 `ZOOM_MEETING_ID=89791995600` 이 설정되어 있다.

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

확인된 사실:

- 새 Zoom 앱 자격증명은 유효하다.
- API 인증 단계는 정상 통과했다.

### 2. live meeting 조회

실행:

```bash
npm run zoom:meeting
```

응답:

```text
status: 400
url: https://api.zoom.us/v2/metrics/meetings/89791995600?type=live
message: This API is only available for ZMP and Business or higher accounts that have enabled the Dashboard feature.
```

판독:

- 새 계정/새 회의 ID 기준으로도 live Dashboard meeting API는 사용할 수 없다.
- 실패 원인은 여전히 계정 플랜/기능 제한이다.

### 3. live participants 조회

실행:

```bash
npm run zoom:participants
```

응답:

```text
status: 400
url: https://api.zoom.us/v2/metrics/meetings/89791995600/participants?type=live&page_size=300
message: This API is only available for ZMP and Business or higher accounts that have enabled the Dashboard feature.
```

판독:

- 새 계정/새 회의 ID 기준으로도 live participants API는 사용할 수 없다.
- 회의 ID 변경과 앱 자격증명 변경으로도 REST 경계가 바뀌지 않았다.

## 이번 단계에서 확인된 사실

확정:

- 새 Zoom 앱 자격증명으로 `zoom:token` 은 성공한다.
- 새 Zoom 앱 자격증명 + 새 회의 ID `89791995600` 기준으로도 `live meeting`, `live participants` API는 실패한다.
- 실패 원인은 `Business 이상 + Dashboard enabled 계정 제약` 메시지 그대로다.

미확정:

- 현재 새 계정에서 webhook 경로는 열리는지
- Paid/Business 이상 계정 변경 시 같은 회의 ID에서 REST API가 열리는지

## 결과 판정

현재 계정 기준 판정:

- `C. 사실상 사용할 수 없음`

의미:

- 새 Zoom 앱 자격증명과 새 회의 ID 기준으로도 REST 기반 `현재 참가자 전체 목록` 조회는 여전히 막혀 있다.

## 다음 단계

다음 우선순위:

1. 새 계정 기준으로 webhook 실측을 다시 진행한다.
2. 필요하면 past 계열 API도 새 계정 기준으로 다시 확인한다.

## 이번 단계 결론

2026-04-04 기준 Step 01 재실측 결과는 명확하다.

- 토큰 발급은 성공
- live meeting 조회는 실패
- live participants 조회는 실패

따라서 새 계정/새 회의 ID로도 현재 계정은 Dashboard live participants 경로를 사용할 수 없다.
