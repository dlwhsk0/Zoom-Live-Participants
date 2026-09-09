/**
 * 헤드리스 Chrome 조작기. 표준입력으로 받은 명령을 순서대로 실행한다.
 *
 * playwright / chromium-cli 를 설치하지 않는다. Node 22 의 전역 WebSocket 으로
 * CDP 에 직접 붙는다 (이 저장소는 이미 Node 20+ 를 요구한다).
 *
 *   node .claude/skills/run-web/scripts/cdp.mjs <<'EOF'
 *   viewport 420 720 2
 *   nav http://localhost:5173/
 *   wait-for .card
 *   scroll 214
 *   topmost .section__title
 *   shot label.png
 *   EOF
 *
 * 명령
 *   viewport <w> <h> [dsf]   화면 크기. 잘라 찍고 싶으면 높이를 줄인다
 *   nav <url>                이동 후 load 대기
 *   wait-for <selector>      요소가 나타날 때까지 (최대 10초)
 *   wait <ms>                고정 대기
 *   scroll <y>               window.scrollTo(0, y)
 *   click <selector>         요소 중앙에 실제 마우스 이벤트를 쏜다
 *   type <text>              현재 포커스에 입력
 *   key <Enter|Escape|...>   키 입력
 *   eval <expr>              페이지에서 평가하고 결과를 출력
 *   topmost <selector>       그 요소 중앙에서 실제로 맨 위에 그려진 요소를 출력
 *                            (스티키 제목 vs 카드 이모지 같은 겹침 판정용)
 *   shot [name.png]          스크린샷. 기본 경로는 $SHOT_DIR (기본 /tmp/zlp-run)
 *   errors                   지금까지 쌓인 콘솔 에러 / 예외 출력
 *
 * 환경변수: SHOT_DIR, CDP_PORT(기본 9222)
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = process.env.CDP_PORT ?? "9222";
const SHOT_DIR = process.env.SHOT_DIR ?? "/tmp/zlp-run";
const CHROME =
	process.env.CHROME_BIN ??
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 9222 가 응답하지 않으면 헤드리스로 직접 띄운다. 한 번 뜨면 계속 재사용한다. */
async function ensureChrome() {
	for (let i = 0; i < 30; i++) {
		try {
			const res = await fetch(`http://localhost:${PORT}/json/version`);
			if (res.ok) return;
		} catch {
			if (i === 0) {
				spawn(
					CHROME,
					[
						"--headless=new",
						`--remote-debugging-port=${PORT}`,
						`--user-data-dir=${SHOT_DIR}/chrome-profile`,
						"--hide-scrollbars",
						"about:blank",
					],
					{ detached: true, stdio: "ignore" },
				).unref();
			}
		}
		await sleep(500);
	}
	throw new Error(`Chrome 이 :${PORT} 에 뜨지 않았다. CHROME_BIN 을 확인해라`);
}

await ensureChrome();
mkdirSync(SHOT_DIR, { recursive: true });

const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (m) => {
	const msg = JSON.parse(m.data);
	if (msg.id) return pending.get(msg.id)?.(msg.result ?? {});
	if (msg.method === "Runtime.exceptionThrown") {
		problems.push(msg.params.exceptionDetails.text ?? "exception");
	}
	if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
		problems.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
	}
};
const send = (method, params = {}) =>
	new Promise((res) => {
		const n = ++id;
		pending.set(n, res);
		ws.send(JSON.stringify({ id: n, method, params }));
	});
const evaluate = async (expression) =>
	(await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))
		.result?.value;

await send("Page.enable");
await send("Runtime.enable");

const script = await new Promise((res) => {
	let buf = "";
	process.stdin.on("data", (c) => (buf += c));
	process.stdin.on("end", () => res(buf));
});

for (const raw of script.split("\n")) {
	const line = raw.trim();
	if (!line || line.startsWith("#")) continue;
	const [cmd, ...rest] = line.split(/\s+/);
	const arg = rest.join(" ");

	switch (cmd) {
		case "viewport": {
			const [w, h, dsf] = rest;
			await send("Emulation.setDeviceMetricsOverride", {
				width: +w, height: +h, deviceScaleFactor: +(dsf ?? 2), mobile: true,
			});
			break;
		}
		case "nav":
			await send("Page.navigate", { url: arg });
			await sleep(1500);
			break;
		case "wait":
			await sleep(+arg);
			break;
		case "wait-for": {
			let found = false;
			for (let i = 0; i < 40; i++) {
				if (await evaluate(`!!document.querySelector(${JSON.stringify(arg)})`)) {
					found = true;
					break;
				}
				await sleep(250);
			}
			if (!found) console.log(`wait-for ${arg}: 못 찾음`);
			break;
		}
		case "scroll":
			await evaluate(`window.scrollTo(0, ${+arg})`);
			await sleep(400);
			break;
		case "click": {
			const box = await evaluate(`(() => {
				const el = document.querySelector(${JSON.stringify(arg)});
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
			})()`);
			if (!box) { console.log(`click ${arg}: 못 찾음`); break; }
			const { x, y } = JSON.parse(box);
			for (const type of ["mousePressed", "mouseReleased"]) {
				await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
			}
			await sleep(600);
			break;
		}
		case "type":
			for (const ch of arg) {
				await send("Input.dispatchKeyEvent", { type: "char", text: ch });
			}
			await sleep(200);
			break;
		case "key":
			for (const type of ["keyDown", "keyUp"]) {
				await send("Input.dispatchKeyEvent", { type, key: arg, code: arg, windowsVirtualKeyCode: arg === "Enter" ? 13 : 27 });
			}
			await sleep(400);
			break;
		case "eval":
			console.log(`eval> ${await evaluate(arg)}`);
			break;
		case "topmost":
			console.log(`topmost> ${await evaluate(`(() => {
				const el = document.querySelector(${JSON.stringify(arg)});
				if (!el) return '못 찾음';
				const r = el.getBoundingClientRect();
				const top = document.elementFromPoint(r.left + r.width / 2, (r.top + r.bottom) / 2);
				return JSON.stringify({ 기준: ${JSON.stringify(arg)}, 맨위: top?.className || top?.tagName });
			})()`)}`);
			break;
		case "shot": {
			const file = resolve(SHOT_DIR, arg || `shot-${Date.now()}.png`);
			const shot = await send("Page.captureScreenshot", { format: "png" });
			writeFileSync(file, Buffer.from(shot.data, "base64"));
			console.log(`shot> ${file}`);
			break;
		}
		case "errors":
			console.log(problems.length ? `errors> ${problems.join(" | ")}` : "errors> 없음");
			break;
		default:
			console.log(`모르는 명령: ${cmd}`);
	}
}

ws.close();
process.exit(0);
