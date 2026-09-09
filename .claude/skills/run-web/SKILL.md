---
name: run-web
description: apps/web 개발 서버를 띄우고 헤드리스 Chrome 으로 실제 화면을 눌러 확인한다. "앱 실행", "개발 서버 띄워", "화면 확인", "스크린샷", "run" 등에 사용.
---

# run-web — 화면을 실제로 띄워서 확인하기

`apps/web` 은 Vite + React 이고 `/api` 를 프록시로 받는다.
따라서 **화면을 보려면 API 가 같이 떠 있어야 한다.**

## 먼저: 개발 서버를 함부로 끄지 않는다

사용자가 브라우저로 보고 있을 수 있다. 확인이 끝났다고 정리하지 마라.
**끄는 것은 사용자가 요청했을 때만.** 다시 띄울 때만 포트를 정리한다.

```bash
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill   # 웹
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill   # API
```

`pkill -f vite` 처럼 넓은 패턴은 쓰지 마라. 세션 자신의 명령줄까지 잡는다.

## 1. API 를 띄운다 — 두 갈래

### (a) 스텁 — 기본값. Docker 없이 즉시 뜬다

화면만 볼 때는 이쪽이다. 24명(접속 16 / 퇴장 8)이 불꽃 단계별로 깔린
고정 스냅샷을 `/api/participants` 로 준다. 이모지 단계·스티키 제목 겹침 같은
**UI 확인에는 이 데이터가 오히려 낫다** — 단계가 골고루 들어 있고 매번 같다.

```bash
node .claude/skills/run-web/scripts/stub-api.mjs &   # :3000
```

사람 수나 누적 시간을 바꾸려면 스크립트 맨 위 `NAMES` / `SECONDS` 를 고친다.
`SECONDS` 경계는 `format.ts` 의 `studyTier` 와 같다 — 30분·1시간·3시간·5시간.

### (b) 진짜 API — 실제 쿼리·상태 저장까지 볼 때

```bash
docker compose up -d postgres
pnpm --filter api db:migrate
pnpm --filter api db:seed     # fixture 를 "12명 접속 중" 시점까지 재생 (.env.test)
pnpm --filter api dev         # :3000
```

> 이 경로는 마지막 확인 시점에 Docker 데몬이 꺼져 있어 **끝까지 돌려보지 못했다.**
> 처음 쓸 때 어긋나는 부분이 있으면 여기를 고쳐 둘 것.

## 2. 웹을 띄운다

```bash
cd apps/web && npx vite --port 5173 --strictPort
```

`vite.config.ts` 가 `/api` 를 `API_ORIGIN`(기본 `http://localhost:3000`)으로
프록시한다. 다른 포트에 API 를 띄웠으면 `API_ORIGIN` 으로 넘긴다.
`--host` 를 붙이면 휴대폰에서도 열어 볼 수 있다.

살아 있는지는 `sleep` 말고 포트로 확인한다:

```bash
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

## 3. 눌러서 확인한다

`playwright` 도 `chromium-cli` 도 이 저장소엔 없다. 설치하지 마라.
`scripts/cdp.mjs` 가 Node 22 의 전역 WebSocket 으로 CDP 에 직접 붙는다.
9222 가 비어 있으면 헤드리스 Chrome 을 알아서 띄운다.

```bash
node .claude/skills/run-web/scripts/cdp.mjs <<'EOF'
viewport 420 720 2
nav http://localhost:5173/
wait-for .card
click .card
shot dialog.png
errors
EOF
```

명령: `viewport` `nav` `wait-for` `wait` `scroll` `click` `type` `key`
`eval` `topmost` `shot` `errors`. 스크린샷은 `$SHOT_DIR`(기본 `/tmp/zlp-run`)
에 떨어진다 — **저장소 안에 남기지 마라.**

**찍었으면 반드시 열어서 봐라.** 빈 화면이면 뜬 게 아니다.

### 겹침(z-index)을 볼 때는 `topmost`

`.section__title` 은 sticky 라 스크롤하면 카드가 그 아래로 지나간다.
카드 이모지가 라벨을 뚫고 올라오는 종류의 버그는 스크린샷만으로는 애매하다.
`topmost` 가 그 지점에서 **실제로 맨 위에 그려진 요소**를 알려준다:

```bash
node .claude/skills/run-web/scripts/cdp.mjs <<'EOF'
viewport 420 150 3          # 높이를 줄이면 라벨 띠만 크게 잡힌다
nav http://localhost:5173/
wait-for .card
scroll 214                  # 카드가 온라인 라벨 아래를 지나는 지점
topmost .section--online .section__title
shot label-band.png
EOF
```

`section__title` 이 나오면 정상. `card__person` / `card__flame` 이 나오면
카드 쪽 z-index 가 새어 나온 것이다.

## 실측 함정

- **`Page.captureScreenshot` 의 `clip` 은 문서 좌표다.** sticky 요소와 어긋나
  엉뚱한 데가 찍힌다. 잘라 찍고 싶으면 `viewport` 높이를 줄여라.
- **`sips --cropOffset` 은 먹지 않는다** (가운데로 잘린다). 위와 같은 이유로
  뷰포트로 자르는 편이 낫다.
- macOS 에서 Chrome 이 뱉는 `CVDisplayLinkCreateWithCGDisplay failed` 는
  헤드리스라서 나는 것이다. 무시해도 된다.
- 이모지 단계는 `isPresent` 인 사람에게만 붙는다. 퇴장자는 `lastOccurredAt`
  기준으로 ☕🥱😴💤 가 정해진다 — 스텁에서 시간을 당겨 두면 단계가 바뀐다.
