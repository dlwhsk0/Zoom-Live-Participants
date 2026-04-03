# 2026-04-04 재검증

이 디렉토리는 2026-04-04 기준으로 새 Zoom 앱 자격증명과 새 회의 ID `89791995600` 으로 다시 수행한 검증 결과를 모은다.

현재 완료:

- Step 01 재검증

현재 결론:

- `zoom:token` 성공
- `GET /metrics/meetings/{meetingId}?type=live` 실패
- `GET /metrics/meetings/{meetingId}/participants?type=live` 실패

즉, 새 Zoom 앱 자격증명으로도 현재 계정은 Dashboard live participants 경로를 열지 못했다.
