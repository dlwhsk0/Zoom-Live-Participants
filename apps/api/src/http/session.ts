import { createHmac } from "node:crypto";

import { tokensMatch } from "./token.ts";

/**
 * 로그인 세션.
 *
 * 세션 테이블을 두지 않는다. 서명한 값을 쿠키에 담아 보내고, 올 때마다
 * 서명을 다시 확인한다. 어드민 한둘이 쓰는 화면이라 서버가 세션 목록을
 * 들고 있을 이유가 없다.
 *
 * 대신 개별 세션을 강제로 끊을 수 없다. 급하면 SESSION_SECRET 을 바꾸면
 * 전부 한 번에 끊긴다.
 *
 * 값 형식: `base64url(payload).base64url(hmac)`
 */
export const SESSION_COOKIE = "session";

/** 하루. 어드민 화면은 가끔 열기 때문에 짧게 잡을 이유가 없다. */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface Session {
	/** users.id */
	sub: string;
	username: string;
	role: string;
	/** 만료 시각(ms). */
	exp: number;
}

const encode = (value: string): string =>
	Buffer.from(value, "utf8").toString("base64url");

function sign(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionValue(
	session: Omit<Session, "exp">,
	secret: string,
	now: number = Date.now(),
): string {
	const payload = encode(
		JSON.stringify({ ...session, exp: now + SESSION_MAX_AGE_MS }),
	);

	return `${payload}.${sign(payload, secret)}`;
}

/**
 * 쿠키 값에서 세션을 꺼낸다. 서명이 틀리거나 만료면 null.
 *
 * 서명을 먼저 보고 그 다음에 내용을 읽는다. 순서가 바뀌면 검증되지 않은
 * JSON 을 파싱하게 된다.
 */
export function readSessionValue(
	value: string | null,
	secret: string,
	now: number = Date.now(),
): Session | null {
	if (!value || !secret) return null;

	const [payload, signature] = value.split(".");
	if (!payload || !signature) return null;

	if (!tokensMatch(signature, sign(payload, secret))) return null;

	let parsed: Partial<Session>;
	try {
		parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return null;
	}

	if (
		typeof parsed.sub !== "string" ||
		typeof parsed.username !== "string" ||
		typeof parsed.role !== "string" ||
		typeof parsed.exp !== "number"
	) {
		return null;
	}

	if (parsed.exp <= now) return null;

	return parsed as Session;
}

/** `Cookie` 헤더에서 이름 하나를 꺼낸다. */
export function cookieFrom(
	header: string | string[] | undefined,
	name: string,
): string | null {
	const raw = Array.isArray(header) ? header[0] : header;
	if (typeof raw !== "string") return null;

	for (const part of raw.split(";")) {
		const index = part.indexOf("=");
		if (index === -1) continue;
		if (part.slice(0, index).trim() !== name) continue;

		return decodeURIComponent(part.slice(index + 1).trim()) || null;
	}

	return null;
}

/**
 * Set-Cookie 를 만든다.
 *
 * 화면과 API 가 다른 도메인이라 SameSite=None 이어야 쿠키가 실린다.
 * 브라우저는 SameSite=None 에 Secure 를 요구한다 — 둘은 같이 다닌다.
 * HttpOnly 라 스크립트가 읽지 못한다. 상태 메시지에 남의 글이 섞이는 화면이라
 * 이건 양보할 수 없다.
 */
export function buildSessionCookie(value: string | null): string {
	const base = [
		`${SESSION_COOKIE}=${value ?? ""}`,
		"Path=/",
		"HttpOnly",
		"Secure",
		"SameSite=None",
	];

	// 값이 없으면 지우는 쿠키다
	base.push(`Max-Age=${value ? Math.floor(SESSION_MAX_AGE_MS / 1000) : 0}`);

	return base.join("; ");
}
