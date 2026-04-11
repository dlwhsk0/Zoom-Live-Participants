# Webhook Docs

이 디렉토리는 Zoom webhook 기준 로직을 따로 모아두는 곳이다.

지금 단계에서 제일 중요한 건 두 가지다.

- 지금 서버가 어떤 이벤트를 받고 있는지
- 그 이벤트를 기준으로 메인 회의실 / 소회의실 / 소회의실 이동을 어떻게 해석하는지

문서 목록:

- `event-inventory.md`
  - 현재 구독/수집 중인 이벤트 정리
- `room-entry-exit-classification.md`
  - 메인 회의실 입퇴장과 소회의실 입퇴장을 구분하는 현재 규칙 정리
