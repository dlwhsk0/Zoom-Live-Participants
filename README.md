# Zoom Live Participants Validation

## 목적

이 저장소의 첫 단계 목표는 Zoom에서 `현재 회의 참가자 전체 목록`을 API로 조회할 수 있는지 검증하는 것이다.

## 준비

1. `.env.example`을 참고해 `.env`를 만든다.
2. Zoom Server-to-Server OAuth 앱 정보를 채운다.
3. `ZOOM_MEETING_ID`에 실제 검증할 회의 ID를 넣는다.

## 실행

토큰 발급:

```bash
npm run zoom:token
```

현재 live meeting 조회:

```bash
npm run zoom:meeting
```

현재 live participants 조회:

```bash
npm run zoom:participants
```

종료된 회의 instance 목록 조회:

```bash
npm run zoom:past-instances
```

특정 meeting ID를 직접 넘기고 싶으면:

```bash
node scripts/getLiveParticipants.mjs 123456789
```

종료 후 past participants 조회:

```bash
node scripts/getPastParticipants.mjs "<meeting-uuid>"
```

웹훅 수신 서버 실행:

```bash
npm run zoom:webhook
```

Cloudflare Quick Tunnel로 공개 URL 생성:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

발급된 URL 예시:

```text
https://example-subdomain.trycloudflare.com
```

서명된 로컬 테스트 이벤트 전송:

```bash
npm run zoom:webhook:test -- meeting.started
npm run zoom:webhook:test -- meeting.participant_joined
npm run zoom:webhook:test -- meeting.participant_left
npm run zoom:webhook:test -- meeting.ended
npm run zoom:webhook:test -- endpoint.url_validation
```

발급된 공개 URL 경유로 테스트 이벤트를 보내고 싶으면:

```bash
ZOOM_WEBHOOK_LOCAL_URL=https://example-subdomain.trycloudflare.com/webhook \
npm run zoom:webhook:test -- endpoint.url_validation
```

## 판정 포인트

- `zoom:meeting`이 현재 회의를 live로 찾는가
- `zoom:participants`가 현재 참가자 배열을 반환하는가
- `zoom:past-instances`가 종료된 회의 UUID를 반환하는가
- `zoom:webhook`이 Zoom 서명 검증과 endpoint validation에 응답하는가
- `cloudflared` 공개 URL이 `/health`, `/webhook` 요청을 정상 전달하는가
- 참가자 입장/퇴장 후 재호출 결과가 실제 Zoom UI와 일치하는가
- 웹훅 이벤트와 participants snapshot이 서로 맞는가
