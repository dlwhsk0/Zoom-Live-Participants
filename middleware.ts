/**
 * 사이트 진입에 공용 비밀번호를 건다 (HTTP Basic 인증).
 *
 * 브라우저가 자기 로그인 창을 띄우고 기억한다. 가입도 세션도 화면도 없다.
 * 팀이 비밀번호 하나를 같이 쓴다.
 *
 * **환경변수가 없으면 아무 일도 하지 않는다.** 배포했다고 잠기지 않는다 —
 * BASIC_AUTH_USER 와 BASIC_AUTH_PASSWORD 를 넣는 순간부터 켜진다.
 *
 * 이건 바깥문이다. 어드민 화면은 안쪽에서 계정으로 다시 막는다.
 */
export const config = {
	// robots.txt 는 열어 둔다. 크롤러가 "들어오지 마라"를 읽기는 해야 한다.
	matcher: "/((?!robots.txt).*)",
	// edge 런타임은 Vercel 이 더 이상 권하지 않는다(빌드 경고).
	// 여기서 쓰는 것은 헤더 읽기와 atob 뿐이라 어느 쪽이든 똑같이 돈다.
	runtime: "nodejs",
};

const REALM = "techeer-up";

/** 앞글자부터 비교하다 멈추면 그 시간 차이로 값을 맞춰 나갈 수 있다. */
function constantTimeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}

	return diff === 0;
}

function unauthorized(): Response {
	return new Response("인증이 필요합니다.\n", {
		status: 401,
		headers: {
			"www-authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
			"content-type": "text/plain; charset=utf-8",
			// 잠긴 응답이 캐시되면 비번을 넣어도 계속 잠겨 보인다
			"cache-control": "no-store",
		},
	});
}

export default function middleware(request: Request): Response | undefined {
	const user = process.env.BASIC_AUTH_USER;
	const password = process.env.BASIC_AUTH_PASSWORD;

	// 설정이 없으면 켜지 않는다
	if (!user || !password) return undefined;

	const header = request.headers.get("authorization");
	if (!header?.startsWith("Basic ")) return unauthorized();

	let decoded: string;
	try {
		decoded = atob(header.slice("Basic ".length).trim());
	} catch {
		return unauthorized();
	}

	// 비밀번호에 콜론이 들어갈 수 있다. 첫 콜론에서만 자른다.
	const separator = decoded.indexOf(":");
	if (separator === -1) return unauthorized();

	const okUser = constantTimeEquals(decoded.slice(0, separator), user);
	const okPassword = constantTimeEquals(decoded.slice(separator + 1), password);

	// 둘 다 확인하고 나서 판단한다. 아이디만 맞아도 시간이 달라지면 안 된다.
	if (!okUser || !okPassword) return unauthorized();

	return undefined;
}
