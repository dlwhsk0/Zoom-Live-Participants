/**
 * 호스트 판정 PoC — 서명 발급 + 정적 파일 서버
 *
 * 확인하려는 것은 두 가지다 (docs/host-detection.md 3.6).
 *   1. getAttendeeslist() 가 참가자로 들어간 봇에게도 isHost 를 채워주는가
 *   2. 회의 중 호스트가 넘어갈 때 SDK 이벤트가 오는가 (아니면 폴링뿐인가)
 *
 * 의존성 없이 돈다. `node --env-file=.env server.mjs`
 */
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5199);

const SDK_KEY = process.env.ZOOM_SDK_KEY ?? '';
const SDK_SECRET = process.env.ZOOM_SDK_SECRET ?? '';
const MEETING_NUMBER = (process.env.ZOOM_MEETING_ID ?? '').replace(/\s/g, '');
const PASSCODE = process.env.ZOOM_MEETING_PASSCODE ?? '';
const BOT_NAME = process.env.ZOOM_BOT_NAME ?? '출석봇(테스트)';

/** Meeting SDK 서명. HS256 JWT 이고 SDK Secret 으로 서명한다. */
function signature(meetingNumber, role) {
	const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const iat = Math.floor(Date.now() / 1000) - 30;
	const exp = iat + 60 * 60 * 2;
	const head = b64({ alg: 'HS256', typ: 'JWT' });
	const body = b64({
		appKey: SDK_KEY,
		sdkKey: SDK_KEY,
		mn: String(meetingNumber),
		role,
		iat,
		exp,
		tokenExp: exp,
	});
	const mac = createHmac('sha256', SDK_SECRET).update(`${head}.${body}`).digest('base64url');
	return `${head}.${body}.${mac}`;
}

// ── ZAK ───────────────────────────────────────────────
// 이 회의는 meeting_authentication=true ("Sign in to Zoom") 이라 익명 조인이
// 막혀 있다. 로그인된 사용자의 ZAK 를 붙여야 들어갈 수 있다.
const S2S_ACCOUNT = process.env.ZOOM_ACCOUNT_ID ?? '';
const S2S_ID = process.env.ZOOM_CLIENT_ID ?? '';
const S2S_SECRET = process.env.ZOOM_CLIENT_SECRET ?? '';
const ZAK_USER = process.env.ZOOM_ZAK_USER ?? 'me';

let tokenCache = null;

async function accessToken() {
	if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.value;
	const auth = Buffer.from(`${S2S_ID}:${S2S_SECRET}`).toString('base64');
	const r = await fetch(
		`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${S2S_ACCOUNT}`,
		{ method: 'POST', headers: { authorization: `Basic ${auth}` } },
	);
	const j = await r.json();
	if (!j.access_token) throw new Error(`토큰 발급 실패: ${j.reason ?? JSON.stringify(j)}`);
	tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
	return tokenCache.value;
}

async function zak() {
	const at = await accessToken();
	const r = await fetch(`https://api.zoom.us/v2/users/${ZAK_USER}/token?type=zak`, {
		headers: { authorization: `Bearer ${at}` },
	});
	const j = await r.json();
	if (!j.token) throw new Error(`ZAK 발급 실패: ${j.message ?? JSON.stringify(j)}`);
	return j.token;
}

function json(res, code, body) {
	const buf = Buffer.from(JSON.stringify(body));
	res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
	res.end(buf);
}

async function readBody(req) {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	if (!chunks.length) return {};
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		return {};
	}
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

	if (url.pathname === '/api/config') {
		// 시크릿은 내보내지 않는다. SDK Key 는 브라우저에 노출되는 값이 맞다.
		return json(res, 200, {
			ready: Boolean(SDK_KEY && SDK_SECRET),
			sdkKey: SDK_KEY,
			meetingNumber: MEETING_NUMBER,
			passcode: PASSCODE,
			userName: BOT_NAME,
			zakAvailable: Boolean(S2S_ACCOUNT && S2S_ID && S2S_SECRET),
		});
	}

	if (url.pathname === '/api/zak') {
		if (!S2S_ACCOUNT || !S2S_ID || !S2S_SECRET) {
			return json(res, 503, { error: 'ZOOM_ACCOUNT_ID / CLIENT_ID / CLIENT_SECRET 가 없다.' });
		}
		try {
			// 토큰 자체는 로그에 남기지 않는다.
			return json(res, 200, { zak: await zak(), user: ZAK_USER });
		} catch (e) {
			console.error('[zak]', e.message);
			return json(res, 502, { error: e.message });
		}
	}

	if (url.pathname === '/api/signature' && req.method === 'POST') {
		if (!SDK_KEY || !SDK_SECRET) {
			// 자물쇠 없이 여는 것보다 안 여는 쪽.
			return json(res, 503, { error: 'ZOOM_SDK_KEY / ZOOM_SDK_SECRET 가 없다. .env 를 채워라.' });
		}
		const body = await readBody(req);
		const mn = String(body.meetingNumber ?? MEETING_NUMBER).replace(/\s/g, '');
		if (!/^\d{9,12}$/.test(mn)) return json(res, 400, { error: `회의 번호가 이상하다: ${mn}` });
		// role 0 = 참가자. 1 은 호스트로 시작하는 것이라 이 PoC 에서는 쓰지 않는다.
		const role = body.role === 1 ? 1 : 0;
		return json(res, 200, { signature: signature(mn, role), sdkKey: SDK_KEY, role });
	}

	// SDK 번들을 우리가 직접 서빙한다. CDN 이 브라우저에서 막히는 경우가 있어서,
	// 그 변수를 아예 없앤다. 헤드리스로 갈 때도 이쪽이 안전하다.
	if (url.pathname.startsWith('/vendor/')) {
		const name = url.pathname.slice('/vendor/'.length);
		if (name.includes('/') || name.includes('..')) {
			res.writeHead(400);
			return res.end('bad path');
		}
		try {
			const buf = await readFile(join(HERE, 'public', 'vendor', name));
			res.writeHead(200, {
				'content-type': 'application/javascript; charset=utf-8',
				'content-length': buf.length,
				'cache-control': 'public, max-age=86400',
			});
			return res.end(buf);
		} catch {
			res.writeHead(404);
			return res.end('vendor not found');
		}
	}

	if (url.pathname === '/' || url.pathname === '/index.html') {
		const html = await readFile(join(HERE, 'public', 'index.html'));
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		return res.end(html);
	}

	res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
	res.end('not found');
});

server.listen(PORT, () => {
	console.log(`\n  호스트 판정 PoC  →  http://localhost:${PORT}\n`);
	if (!SDK_KEY || !SDK_SECRET) {
		console.log('  ⚠ ZOOM_SDK_KEY / ZOOM_SDK_SECRET 가 비어 있다. .env.example 을 보고 .env 를 만들어라.\n');
	} else {
		console.log(`  SDK Key   ${SDK_KEY.slice(0, 6)}…`);
		console.log(`  회의 번호  ${MEETING_NUMBER || '(미설정 — 화면에서 입력)'}`);
		console.log(`  봇 이름    ${BOT_NAME}\n`);
	}
});
