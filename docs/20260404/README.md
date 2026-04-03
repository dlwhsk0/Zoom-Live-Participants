# 2026-04-04 재검증

이 디렉토리는 2026-04-04 기준으로 새 Zoom 앱 자격증명과 새 회의 ID `89791995600` 으로 다시 수행한 검증 결과를 모은다.

현재 완료:

- Step 01 재검증
- Step 02 REST 대체 경로 재검증
- Step 03 webhook 스모크 체크
- Step 04 실제 입/퇴장 webhook 실측
- Step 05 webhook 데이터 모델과 매칭 전략 정리
- Step 06 Slack Incoming Webhook 연동 준비 문서화
- Step 07 Slack Incoming Webhook 구현

현재 결론:

- `zoom:token` 성공
- `GET /metrics/meetings/{meetingId}?type=live` 실패
- `GET /metrics/meetings/{meetingId}/participants?type=live` 실패
- `GET /past_meetings/{meetingId}/instances` scope 부족으로 실패
- `GET /past_meetings/{meetingUUID}/participants` scope 부족으로 실패
- webhook health / endpoint validation 은 성공
- `meeting.participant_joined` 실제 수신 성공
- `meeting.participant_left` 실제 수신 성공
- join/left 매칭 키는 `user_id` 보다 `participant_uuid` 가 더 안정적으로 보임
- Slack Incoming Webhook 기준 연동 절차 정리 완료
- Slack Incoming Webhook 전송 코드 구현 완료

즉, 새 Zoom 앱 자격증명으로도 현재 계정은 REST 기반 live/past 참가자 경로를 열지 못했지만, webhook 기반 입/퇴장 이벤트 수집은 가능하다.
