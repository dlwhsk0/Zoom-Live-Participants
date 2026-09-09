# 접근 정책과 보안 점검

이 문서는 **현재 기준서**다. 상태가 바뀌면 여기를 고친다.

## 1. 무엇을 지키려는 것인가

레포는 공개다(추후 오픈소스). **가려야 하는 것은 코드가 아니라 화면에 뜨는 사람들이다.**

조회 API 는 인증 없이 참가자 **실명**을 내준다. 이건 설계상 그렇다 —
회의 참가자가 링크만으로 바로 보게 하려고 로그인을 두지 않았다.
그래서 지켜야 할 선은 하나다.

> 아는 사람이 링크로 들어오는 것은 괜찮다.
> **모르는 사람이 검색으로 흘러들어오는 것은 안 된다.**

이 둘은 다른 문제이고, 해법도 다르다. 검색 노출은 팻말(robots)로,
접근 차단은 자물쇠(인증)로 막는다. 지금 건 것은 **팻말까지**다.

## 2. 지금 적용된 것 — 검색 차단

| 어디 | 무엇 | 파일 |
|---|---|---|
| 화면 | `/robots.txt` 로 전 경로 차단 | `apps/web/public/robots.txt` |
| 화면 | `<meta name="robots" content="noindex, nofollow">` | `apps/web/index.html` |
| 화면 | 모든 응답에 `X-Robots-Tag: noindex, nofollow` | `vercel.json` |
| API | `GET /robots.txt` 로 전 경로 차단 | `apps/api/src/http/server.ts` |
| API | 모든 응답에 `X-Robots-Tag: noindex, nofollow` | `apps/api/src/http/server.ts` |

세 겹으로 두는 이유가 각각 있다.

- `robots.txt` 는 크롤러가 **읽어야** 지킨다. 링크를 타고 URL 로 바로 온
  크롤러는 읽지 않을 수 있다 — 그래서 응답 헤더에도 박는다.
- 헤더는 프록시가 떼어낼 수 있다 — 그래서 HTML 안에도 적는다.
- **API 도 막아야 한다.** JSON 응답도 색인 대상이고, 실명이 들어 있는 것은
  화면이 아니라 API 다. 화면만 막으면 절반이다.

`vercel.json` 의 rewrite 는 `/(.*)` 를 `index.html` 로 보낸다.
이 규칙이 `robots.txt` 까지 삼키면 아무 의미가 없으므로, 그 앞에
자기 자신으로 가는 규칙을 하나 둔다. Vercel 이 정적 파일을 rewrite 보다
먼저 보긴 하지만, 순서에 기대지 않고 명시한다.

### 이걸로 되는 것과 안 되는 것

- 된다: 구글·빙 등 규칙을 지키는 검색엔진의 색인.
- **안 된다: 접근 차단.** URL 을 아는 사람은 그대로 들어온다. 무시하는
  크롤러도 그대로 들어온다. 이건 자물쇠가 아니다.

### 이미 색인된 경우

`robots.txt` 로 막으면 크롤러가 페이지를 **다시 읽지 못해서** 이미 올라간
검색 결과가 오히려 안 내려갈 수 있다. 색인을 지우는 것은 `noindex` 헤더
쪽이다. 확인은 검색창에 `site:techeer-comeon.vercel.app` 으로 한다.
이미 걸려 있으면 Search Console 의 삭제 요청이 가장 빠르다.

## 3. 접근 차단이 필요해지면 — 선택지

아직 고르지 않았다. 판단 근거만 남긴다.

### HTTP Basic Auth 란

서버가 `401 + WWW-Authenticate: Basic` 을 내리면 **브라우저가 자체 로그인
창을 띄운다.** 가입도 세션도 로그인 화면도 DB 도 없다. 공유하는 것은
계정이 아니라 비밀번호 하나이고, 브라우저가 기억한다.

| | Basic Auth | 계정 로그인 |
|---|---|---|
| 만들 것 | 없음 (설정) | 유저 테이블·세션·화면 |
| 쓰는 쪽 | 비번 1회 입력 | 가입 → 로그인 |
| 공유 단위 | 팀 공용 비번 | 사람마다 계정 |
| 누가 봤는지 | 모름 | 알 수 있음 |

### 이 프로젝트에서의 함정

화면(Vercel)과 API(Dokploy/Traefik)가 **다른 도메인**이다.

- 화면에만 걸면 → API 는 그대로 열려 있다. 실명은 API 에서 나온다. 무의미.
- 양쪽에 걸면 → 브라우저 `fetch` 는 자격증명을 자동으로 싣지 않는다.
  화면이 깨진다.

그래서 Basic Auth 를 고른다면 **공유 토큰 방식**이 더 맞는다. API 가
토큰을 요구하고, 화면이 그 토큰을 URL 조각이나 저장소에서 읽어 헤더로
싣는다. 사용자 경험은 "링크 한 번" 으로 같고, 두 도메인 문제가 없다.

## 4. 점검 결과

2026-09-09 기준. 코드 읽기와 운영 엔드포인트 확인(읽기 전용)으로 봤다.

### 잘 되어 있는 것

- 웹훅 서명 검증이 fail-closed 이고 `timingSafeEqual` 을 쓴다 (`webhook/signature.ts`)
- `publicIp` 를 응답에 넣지 않는다. 일치 여부만 `isYou` 로 알린다 (`repository/query.ts`)
- 상태 메시지의 링크를 URL 파싱 + 호스트 allowlist 로 거른다. `javascript:` 가 막힌다 (`web/src/status-link.ts`)
- `dangerouslySetInnerHTML` 을 쓰지 않는다. React 가 escape 한다
- 운영 CORS 가 잠겨 있다. 허용 목록 밖 오리진에는 헤더를 주지 않는다
- 공개 히스토리(`main`, `snapshot/v1-esm`)에 실제 비밀값이 없다

### 남은 것

| # | 무엇 | 위치 | 영향 |
|---|---|---|---|
| 1 | **상태 메시지 쓰기에 인증이 없다** | `http/server.ts` `PUT /api/participants/:uuid/status` | `participantUuid` 는 공개 조회 API 가 그대로 내준다. 누구나 남의 상태 메시지를 덮어쓸 수 있다. 화면의 `isYou` 는 확인창을 건너뛰는 힌트일 뿐 서버는 보지 않는다 |
| 2 | **웹훅 재생(replay) 방어가 없다** | `webhook/signature.ts` | `x-zm-request-timestamp` 를 서명 계산에만 쓰고 신선도를 안 본다. 유효한 요청을 한 번 가로채면 무한 재전송해 입퇴장 기록을 오염시킬 수 있다. 5분 넘으면 거부하면 된다 |
| 3 | 토큰이 URL 쿼리에 담긴다 | `http/server.ts` `checkToken`, `web/src/Logs.tsx` | `?key=...` 는 접근 로그·브라우저 히스토리·Referer 에 남는다. 로그 API 는 이름과 IP 를 그대로 내주는 곳이다. 비교도 상수시간이 아니다 — 같은 저장소에 `safeEquals` 가 이미 있다 |
| 4 | 레이트리밋이 없다 | `http/server.ts` | 1번과 겹치면 상태 메시지 스팸을 막을 수단이 없다 |
| 5 | 프론트 프로젝트에 백엔드 비밀값이 있다 | Vercel 환경변수 | 아래 5절 |

1·2번이 실제로 뒤가 열려 있는 구멍이다. 이 브랜치의 범위 밖이라 손대지 않았다.

## 5. Vercel 환경변수 정리 대상

프론트는 정적 사이트다. 빌드 때 번들에 박히는 것은 `VITE_` 접두사뿐이고,
나머지는 **쓰이지 않으면서 저장만 되어 있다.** 지금 번들에 실리지는 않지만,
누군가 이름을 `VITE_` 로 바꾸는 순간 브라우저로 나간다.

레포를 공개하기 전에 훑어볼 목록이다. 삭제·로테이션은 직접 판단한다.

| 이름 | 환경 | 만든 지 | 비고 |
|---|---|---|---|
| `VITE_API_BASE` | Production / Preview / Development | 10일 | **쓰인다.** 번들에 박힌다(공개 전제) |
| `SLACK_BOT_TOKEN` | Production | 150일 | v1 잔재로 보임 |
| `SLACK_DEFAULT_CHANNEL_ID` | Production | 150일 | v1 잔재로 보임 |
| `SLACK_ADMIN_API_KEY` | Production | 150일 | v1 잔재로 보임 |
| `ZOOM_ACCOUNT_ID` | Production | 150일 | v1 잔재로 보임 |
| `ZOOM_CLIENT_ID` | Production | 150일 | v1 잔재로 보임 |
| `ZOOM_CLIENT_SECRET` | Production | 150일 | v1 잔재로 보임 |
| `SUPABASE_URL` | Production | 150일 | v2 는 Supabase 를 쓰지 않는다 |
| `SUPABASE_ANON_KEY` | Production | 150일 | v2 는 Supabase 를 쓰지 않는다 |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | 150일 | **RLS 를 우회하는 키다.** 살아 있는 프로젝트라면 로테이션 |
| `PORT` | Production | 150일 | 정적 사이트에 의미 없음 |

150일 된 값들은 v1(Supabase + Slack) 시절의 것이다. v2 백엔드는 Dokploy 에서
자기 환경변수를 따로 쓴다.

## 6. 확인 방법

```bash
# 검색 차단이 살아 있는지
curl -s https://techeer-comeon.vercel.app/robots.txt
curl -sI https://techeer-comeon.vercel.app | grep -i x-robots-tag
curl -s https://techeerzoom.techeer.cloud-yaho.cloud/robots.txt
curl -sI https://techeerzoom.techeer.cloud-yaho.cloud/health | grep -i x-robots-tag

# 조회 API 가 무엇을 내주는지 (실명이 나온다)
curl -s https://techeerzoom.techeer.cloud-yaho.cloud/api/participants | head -c 300

# CORS 가 잠겨 있는지 — 허용 목록 밖 오리진엔 allow-origin 이 없어야 한다
curl -sI -H "Origin: https://example.com" \
  https://techeerzoom.techeer.cloud-yaho.cloud/api/participants | grep -i access-control
```

로컬에서 화면을 띄워 보는 절차는 `.claude/skills/run-web/SKILL.md` 에 있다.
