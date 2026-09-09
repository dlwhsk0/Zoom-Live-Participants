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

## 3. 접근 구조

문을 두 겹으로 둔다. 목적이 다르니 수단도 나눈다.

```
바깥문  사이트 전체        공용 비밀번호 (HTTP Basic)   "외부인 차단"
  └ 참가자 화면            로그인 없음                  "링크 하나로 바로"
  └ 어드민 화면 ──────── 계정 로그인 (users)          "아무나 못 만지게"
```

### 참가자는 왜 로그인이 없나

이 앱의 참가자는 **Zoom 웹훅이 만든 존재**(`participant_uuid`)이고, `users`
테이블은 **가입이 만든 존재**다. 서로 다른 신원 공간이라 자동으로 이어지지
않는다. "이 계정이 저 타일의 주인" 임을 알려면 둘을 잇는 단계가 따로 필요하다.

지금은 잇지 않는다. 대신 상태 메시지는 **막지 않고 남긴다**(4절).

### 바깥문 — HTTP Basic

서버가 `401 + WWW-Authenticate: Basic` 을 내리면 브라우저가 자기 로그인 창을
띄운다. 가입도 세션도 화면도 없고, 팀이 비밀번호 하나를 같이 쓴다.

Vercel 엣지(`middleware.ts`)에서 건다. **환경변수가 없으면 켜지지 않는다** —
`BASIC_AUTH_USER` 와 `BASIC_AUTH_PASSWORD` 를 넣는 순간부터 잠긴다.
`robots.txt` 는 통과시킨다. 크롤러가 "들어오지 마라" 는 읽어야 한다.

한계는 분명하다. 비번을 아는 사람은 전부 같은 권한이고, 누가 봤는지 모른다.
바깥문에는 그 이상이 필요 없다.

### 안쪽문 — 계정 로그인

`users` 테이블(`username` / `password_hash` / `role`).

- 해시는 **Node 내장 scrypt**. argon2/bcrypt 는 네이티브 빌드가 필요한데 이
  저장소는 의존성을 얇게 유지해 왔다. 파라미터를 해시 값 안에 담아
  (`scrypt$N$r$p$salt$hash`) 나중에 세기를 올려도 옛 해시를 계속 검증한다
- 세션은 **서명한 쿠키 하나**. 세션 테이블을 두지 않는다 — 어드민 한둘이 쓰는
  화면이라 서버가 목록을 들고 있을 이유가 없다. 대신 **개별 세션을 끊을 수
  없다.** 급하면 `SESSION_SECRET` 을 바꿔 전부 끊는다
- 화면과 API 가 다른 도메인이라 `SameSite=None` + `Secure` +
  `Access-Control-Allow-Credentials` 가 같이 필요하다. CORS 허용 목록이 이미
  잠겨 있어(`*` 아님) 전제 조건은 충족돼 있었다
- 없는 아이디로 로그인해도 해시를 한 번 돌린다. 응답 시간으로 아이디의 존재를
  알 수 있으면 안 된다
- IP 당 10분에 10번으로 시도를 제한한다. 프로세스 메모리에만 둔다 —
  인스턴스를 늘리면 이건 다시 봐야 한다

`role` 은 `admin` / `member` 다. 지금 실제로 쓰는 것은 `admin` 뿐이고,
나중에 팀원 계정을 열 여지를 남겨 둔 것이다.

### 어드민 화면 주소

`VITE_ADMIN_PATH` 로 정한다. 비우면 `/admin` 이다.

**레포가 공개라 코드에 진짜 주소를 적으면 그 순간 공개된다.** 그래서 코드에는
기본값만 두고, 감추려면 배포 환경변수에만 넣는다.

주소를 감추는 것은 자물쇠가 아니다. 그 화면은 로그인으로 막혀 있고, 주소는
그 위에 얹는 얇은 한 겹이다 — 없다고 아쉬울 것도, 있다고 안심할 것도 아니다.

정해진 주소가 아니면 404 화면을 그린다. **HTTP 상태는 200 이다.** 이 앱은 어느
주소로 와도 같은 `index.html` 을 받고 화면에서 갈라진다. 서버가 진짜 404 를
주게 하려면 유효한 주소 목록을 서버가 알아야 하는데, 그러면 어드민 주소만
200 이라 훑어보면 찾힌다. 전부 200 이면 스캐너 쪽에서는 구분되지 않는다.
404 화면에서도 무엇이 있고 없는지 말하지 않는다.

**가입 화면은 없다.** 계정은 `scripts/create-user.ts` 로만 만든다.

```bash
# 대상 DB 는 .env 의 DATABASE_URL 이다. 어느 쪽을 가리키는지 먼저 확인할 것
pnpm --filter api user:create -- <아이디> admin
PASSWORD=... pnpm --filter api user:create -- <아이디> admin
```

비밀번호를 바꿀 때는 이쪽이다.

```bash
PASSWORD=... pnpm --filter api user:password -- <아이디>
```

비밀번호를 인자로 받지 않는 것은 셸 히스토리에 남기 때문이다. 비워 두면
무작위로 만들어 한 번만 보여준다.

**비밀번호를 바꿔도 이미 발급된 세션은 끊기지 않는다.** 서명한 쿠키만 쓰고
세션 테이블을 두지 않아서, 서버가 끊을 목록을 들고 있지 않다. 전부 끊으려면
`SESSION_SECRET` 을 바꾸고 API 를 다시 띄운다.

### API 게이트 — 공유 토큰

`/api/participants` 는 참가자 실명을 그대로 내준다. 여기를 막는 것은 **CORS 도
Tailscale 도 아니다.**

- **CORS 는 브라우저에게 주는 지시**다. 남의 사이트가 방문자 브라우저를 시켜
  읽는 것은 막지만, `curl` 로 부르면 서버는 그대로 200 에 전체 JSON 을 준다
- **Tailscale 은 DB 만 가린다.** API 도메인은 공인 IP(`157.151.206.201`)로,
  참가자들이 각자 집에서 접속해야 하므로 당연히 공개다

서버가 검사할 수 있는 것은 비밀값뿐이다. `ACCESS_TOKEN` 을 설정하면
`x-access-token` 헤더를 요구한다(`Authorization: Bearer` 도 받는다).

- 웹훅(Zoom 이 부른다)과 헬스체크(컨테이너가 부른다), `robots.txt` 는 걸지 않는다
- 어드민 쪽은 이미 세션이나 토큰으로 막혀 있다
- **비어 있으면 검사하지 않는다.** 배포만으로 화면이 죽지 않게 한다
- **공백 없는 ASCII 여야 한다.** HTTP 헤더는 Latin-1 만 담아서, 한글을 넣으면
  브라우저가 아예 보내지 못하고 화면이 조용히 401 로 죽는다. 기동할 때 거른다

토큰은 화면 번들에 박혀 나간다. **감추는 값이 아니라 번들을 받을 수 있는
사람에게만 주는 값이다** — 사이트가 공용 비밀번호 뒤에 있으면 토큰을 얻으려면
먼저 그 문을 통과해야 한다. **그래서 basic auth 와 세트로 켠다.** 사이트를
잠그지 않고 이것만 켜면 토큰도 같이 공개되어 의미가 없다.

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
| 1 | 상태 메시지 쓰기에 인증이 없다 | `PUT /api/participants/:uuid/status` | **막지 않기로 했다.** 로그인을 붙이면 "링크 하나로 바로 쓴다" 는 성질이 사라진다. 대신 누가(IP) 무엇을 바꿨는지 `admin_actions` 에 남기고, 어드민 화면에서 되돌릴 수 있게 했다 |
| 2 | 레이트리밋이 없다 | `http/server.ts` | 로그인에만 걸었다. 상태 메시지 쓰기에는 아직 없다 — 스팸이 실제로 생기면 그때 붙인다 |
| 3 | `LOGS_TOKEN` 이 아직 살아 있다 | `http/server.ts` `checkToken` | 화면은 세션 로그인으로 옮겼고 `?key=` 를 더 이상 쓰지 않는다. 서버는 아직 토큰도 받는다 — 계정으로 완전히 옮긴 뒤 걷어낸다 |
| 4 | IP 를 권한 판단에 쓸 수 없다 | `http/client-ip.ts` | `X-Forwarded-For` 의 **맨 앞** 값을 읽는다. Traefik 은 뒤에 덧붙이므로 클라이언트가 앞을 위조할 수 있다. 지금은 힌트(`isYou`)로만 쓰니 피해가 없지만, **IP 를 권한으로 승격하려면 반드시 먼저 고쳐야 한다** |

### 해결된 것

- **웹훅 재생 방어** — 서명이 맞은 뒤 `x-zm-request-timestamp` 의 신선도를 본다.
  양쪽으로 5분. 단위는 자릿수로 가른다(초/밀리초 문서가 엇갈린다)
- **토큰 비교가 상수 시간** — `http/token.ts`. 앞글자부터 비교하다 멈추면 그
  시간 차이로 토큰을 한 글자씩 맞춰 나갈 수 있다
- **`HEAD /robots.txt` 가 404** — HEAD 를 GET 으로 라우팅한다

## 5. Vercel 환경변수 정리 대상

프론트는 정적 사이트다. 빌드 때 번들에 박히는 것은 `VITE_` 접두사뿐이고,
나머지는 **쓰이지 않으면서 저장만 되어 있다.** 지금 번들에 실리지는 않지만,
누군가 이름을 `VITE_` 로 바꾸는 순간 브라우저로 나간다.

2026-09-09 에 죽은 값을 지웠다. 남은 것은 아래가 전부다.

| 이름 | 환경 | 비고 |
|---|---|---|
| `VITE_API_BASE` | Production / Preview / Development | **쓰인다.** 번들에 박힌다(공개 전제) |
| `BASIC_AUTH_USER` | Production | 넣으면 사이트가 잠긴다. 없으면 안 잠긴다 |
| `BASIC_AUTH_PASSWORD` | Production | 위와 짝 |
| `PORT` | Production | 정적 사이트에 의미 없음. 지워도 그만 |

지운 것: Slack 3개(`BOT_TOKEN`, `DEFAULT_CHANNEL_ID`, `ADMIN_API_KEY`),
Supabase 3개(`URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`),
Zoom REST 3개(`ACCOUNT_ID`, `CLIENT_ID`, `CLIENT_SECRET`).

Slack 앱과 Supabase 프로젝트는 이미 없어서 가리키는 곳이 없는 값이었다.
Zoom 앱은 살아 있지만 **현재 코드가 REST API 를 쓰지 않는다** — 웹훅만 받고,
그건 `ZOOM_WEBHOOK_SECRET_TOKEN` 으로 백엔드에서 검증한다. 정적 사이트
프로젝트에 둘 이유가 없어 지웠다. 나중에 필요하면 Zoom 앱 콘솔에서 다시
받아 백엔드 쪽에만 넣는다.

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

```bash
# 사이트가 잠겼는지 (BASIC_AUTH_* 를 넣은 뒤)
curl -sI https://techeer-comeon.vercel.app | head -1        # 401 이어야 한다
curl -sI -u '아이디:비밀번호' https://techeer-comeon.vercel.app | head -1   # 200

# 로그인이 되는지
curl -s -X POST https://<api>/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"...","password":"..."}' -i | head -20
```

## 7. 배포 순서

인증을 켜는 순서를 틀리면 자기가 잠긴다.

1. **마이그레이션** — `users` 테이블(`0007`). 대상 DB 가 어디인지 먼저 확인한다.
   `.env` 의 `DATABASE_URL` 은 주석을 바꿔가며 전환하게 되어 있다
2. **`SESSION_SECRET` 설정** — 비어 있으면 로그인이 503 이다
3. **계정 생성** — `scripts/create-user.ts`. **이걸 먼저 안 하면 어드민 화면에
   못 들어간다.** 화면에서 `?key=` 는 더 이상 쓰지 않는다
4. **배포**
5. 마지막에 `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` — 이걸 넣는 순간 잠긴다

로컬에서 화면을 띄워 보는 절차는 `.claude/skills/run-web/SKILL.md` 에 있다.
