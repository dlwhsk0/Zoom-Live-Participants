# 호스트 판정 PoC

`docs/host-detection.md` 3.6 의 **미검증 2건**을 판별하는 일회용 도구다.
운영 코드가 아니고 pnpm 워크스페이스(`apps/*`)에도 들어 있지 않다.

| # | 확인할 것 | 안 되면 |
|---|---|---|
| 1 | `getAttendeeslist()` 가 **참가자로 들어간 봇**에게도 `isHost` 를 채워주는가 | 3절(봇) 설계가 통째로 무효 → 4절로 간다 |
| 2 | 호스트가 넘어갈 때 **SDK 이벤트**가 오는가, 아니면 폴링으로만 잡히는가 | 폴링 주기만큼 지연을 감수하면 된다. 치명적이지 않다 |

의존성이 없다. `pnpm install` 필요 없고 Node 22 면 그냥 돈다.

## 1. 준비 — Meeting SDK 앱 만들기 (웹 콘솔, 사람이 해야 함)

[marketplace.zoom.us](https://marketplace.zoom.us) 에 **방 주인 계정(`techeer1`)으로** 로그인한다.
이 계정이 아니면 내부 회의 예외에 걸리지 않아서 앱 심사가 필요해진다.

1. Develop → Build App → **General App**
2. 좌측 **Embed** 탭 → **Meeting SDK** 토글을 켠다
3. **App Credentials** 의 Client ID / Client Secret 을 복사한다
   - 이게 `ZOOM_SDK_KEY` / `ZOOM_SDK_SECRET` 다
   - 루트 `.env` 의 `ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET`(Server-to-Server OAuth)과는 **다른 값**이다
4. 게시(Publish)도 심사(Submit for Review)도 하지 않는다. 자기 계정 회의에 붙는 건 면제다

## 2. 실행

```sh
cd poc/host-probe
cp .env.example .env    # 위에서 받은 값과 회의 번호·암호를 채운다
node --env-file=.env server.mjs
```

→ http://localhost:5199

`localhost` 는 보안 컨텍스트로 취급되므로 HTTPS 없이 SDK 가 동작한다.

## 3. 시나리오 — 5분

1. **참가** 를 누른다. 봇이 role 0(참가자)으로 들어간다
2. 로그의 `[필드]` 줄을 본다 → **확인 1 의 답이 여기서 바로 나온다**
   - `isHost 있음 ✓` 이면 통과
   - `isHost 없음 ✗` 이면 여기서 끝. 3절을 접고 4절로 간다
3. 폰이나 다른 기기로 같은 회의에 들어간다
4. **호스트를 그 기기에 넘긴다** (참가자 목록 → 호스트 만들기)
5. 로그의 `[호스트] 바뀜` 줄과 그 아래 `└` 줄을 본다 → **확인 2 의 답**
   - `직전 5초 내 이벤트: user-updated …` → 이벤트로 잡힌다
   - `직전 5초 내 이벤트 없음` → 폴링으로만 잡힌다
6. 다시 봇 쪽으로 되넘겨 보고, 봇이 호스트를 물었을 때 목록이 어떻게 보이는지도 남긴다

`[event]` 줄은 등록에 성공한 이벤트가 실제로 불린 기록이다. SDK 가 어떤 이름을
갖고 있는지 몰라서 후보를 전부 걸어보고, 불리는 것만 로그에 남긴다.

## 4. 결과를 어디에 적나

`docs/host-detection.md` 3.6 을 실측 결과로 바꾼다. 판정이 끝나면 이 디렉토리는
지워도 된다 — 그러라고 워크스페이스 밖에 뒀다.

## 주의

- 봇도 참가자다. 이걸 켜 두면 **웹훅에 `출석봇(테스트)` 입퇴장이 그대로 쌓인다.**
  운영 DB 를 보고 있다면 그 이름을 빼고 읽어라
- 봇이 회의의 **첫 입장자가 되면 봇이 호스트를 가져간다.** 사람이 이미 있는
  회의에 들어가는 편이 안전하다
- `.env` 에 회의 암호가 들어간다. `.gitignore` 의 `.env*` 로 막혀 있지만
  스크린샷·화면공유 때는 주의해라

## SDK 번들을 로컬에서 서빙하는 이유

`source.zoom.us` CDN 이 브라우저에서 막히는 경우가 있었다(터미널 curl 은 되는데
브라우저에서만 안 떴다). 번들은 **파일 맨 끝에서** `window.ZoomMtgEmbedded` 를
세팅하므로, 3.5MB 가 끝까지 받아지지 않으면 전역이 통째로 없다.

그래서 `public/vendor/` 에 받아두고 우리 서버가 직접 준다. 이 파일은 커밋하지
않는다(`.gitignore`). 없으면 다시 받아라.

```sh
curl -o public/vendor/zoom-meeting-embedded-6.2.0.min.js \
  https://source.zoom.us/zoom-meeting-embedded-6.2.0.min.js
```

다만 **미디어 자산(av 라이브러리, wasm)은 여전히 `source.zoom.us` 에서 런타임에
받아온다.** CDN 이 완전히 차단된 환경이면 조인 단계에서 또 막힐 수 있고, 그때는
`client.init({ assetPath })` 로 그쪽도 로컬로 돌려야 한다.
