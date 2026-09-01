/**
 * 상태 메시지 안의 유튜브 링크를 찾아낸다.
 *
 * 상태 메시지는 **인증 없이 누구나 쓸 수 있다.** 그래서 아무 URL 이나
 * 링크로 만들면 남의 타일에 피싱 주소를 걸 수 있다. 유튜브만 허용한다.
 *
 * 검사는 문자열 패턴이 아니라 URL 파싱으로 한다. `javascript:` 같은
 * 스킴이 끼어들 여지를 없애려면 호스트와 프로토콜을 직접 봐야 한다.
 */

const ALLOWED_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"youtu.be",
	"www.youtu.be",
]);

/** 공백으로 끊기는 토큰 중 링크처럼 생긴 것. 판정은 parseYoutube 가 한다. */
const CANDIDATE = /(?:https?:\/\/|www\.)\S+|(?:youtu\.be|youtube\.com)\/\S+/gi;

/**
 * 유튜브 주소면 정규화한 https URL 을, 아니면 null 을 준다.
 *
 * 스킴이 없으면 https 를 붙여 본다. 사람들은 `youtu.be/...` 로만 적는다.
 */
export function parseYoutube(token: string): string | null {
	// 문장 끝에 붙은 문장부호는 주소가 아니다
	const trimmed = token.replace(/[),.!?]+$/, "");

	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}

	// URL 생성자는 스킴을 그대로 살린다. 다시 확인해야 javascript: 를 막는다.
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

	url.protocol = "https:";
	return url.toString();
}

export interface ParsedStatus {
	/** 링크를 걷어낸 나머지 글. 타일에는 이것만 보인다. */
	text: string;
	/** 처음 나온 유튜브 주소. 없으면 null. */
	youtube: string | null;
}

/**
 * 상태 메시지를 글과 링크로 가른다.
 *
 * 타일 한 칸이 90px 남짓이라 주소를 그대로 보여줄 수 없다.
 * 주소는 걷어내고 작은 링크 표시로 대신한다.
 */
export function parseStatus(value: string | null): ParsedStatus {
	if (!value) return { text: "", youtube: null };

	let youtube: string | null = null;

	const text = value
		.replace(CANDIDATE, (token) => {
			const link = parseYoutube(token);
			if (!link) return token;
			// 첫 번째 것만 쓴다. 여러 개를 걸 이유가 없다.
			youtube ??= link;
			return "";
		})
		.replace(/\s+/g, " ")
		.trim();

	return { text, youtube };
}

export interface YoutubeInfo {
	title: string;
}

/**
 * 유튜브 영상 제목을 가져온다.
 *
 * oEmbed 는 키가 필요 없고 CORS 도 열려 있어 브라우저가 직접 부를 수 있다.
 * 서버를 거치지 않으므로 우리 쪽에 SSRF 여지가 생기지 않는다.
 *
 * 주소는 부르기 전에 parseYoutube 를 통과해야 한다. 허용 호스트가 아니면
 * 여기까지 오지 않는다.
 *
 * 제목은 남이 지은 글이다. 반드시 텍스트로만 그린다(React 가 escape 한다).
 */
export async function fetchYoutubeInfo(url: string): Promise<YoutubeInfo> {
	const endpoint = new URL("https://www.youtube.com/oembed");
	endpoint.searchParams.set("url", url);
	endpoint.searchParams.set("format", "json");

	const response = await fetch(endpoint, { headers: { accept: "application/json" } });

	// 없는 영상이거나 비공개면 400 이 온다
	if (!response.ok) throw new Error("영상 정보를 불러오지 못했습니다");

	const body = (await response.json()) as { title?: unknown };

	if (typeof body.title !== "string") {
		throw new Error("영상 정보를 불러오지 못했습니다");
	}

	return { title: body.title };
}
