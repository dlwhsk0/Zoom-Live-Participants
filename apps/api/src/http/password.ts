import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/**
 * 비밀번호 해시.
 *
 * argon2/bcrypt 를 쓰지 않는다. 둘 다 네이티브 빌드가 필요한데, 이 저장소는
 * 의존성을 얇게 유지해 왔고 Node 내장 scrypt 로 충분하다.
 *
 * 저장 형식: `scrypt$N$r$p$salt$hash` (salt·hash 는 base64)
 * 파라미터를 값 안에 넣어 두면 나중에 세기를 올려도 옛 해시를 계속 검증할 수 있다.
 */
const KEY_LENGTH = 64;
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(plain: string): Promise<string> {
	const salt = randomBytes(16);
	const { N, r, p } = DEFAULT_PARAMS;
	const derived = await scryptAsync(plain, salt, KEY_LENGTH, { N, r, p });

	return [
		"scrypt",
		N,
		r,
		p,
		salt.toString("base64"),
		derived.toString("base64"),
	].join("$");
}

/**
 * 비밀번호 검증.
 *
 * 해시 형식이 깨져 있으면 통과시키지 않는다. 저장된 값이 이상할 때
 * 열리는 쪽으로 실패하면 안 된다.
 */
export async function verifyPassword(
	plain: string,
	stored: string,
): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 6 || parts[0] !== "scrypt") return false;

	const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
	const N = Number(rawN);
	const r = Number(rawR);
	const p = Number(rawP);

	if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
		return false;
	}

	const expected = Buffer.from(rawHash ?? "", "base64");
	if (expected.length === 0) return false;

	const derived = await scryptAsync(
		plain,
		Buffer.from(rawSalt ?? "", "base64"),
		expected.length,
		{ N, r, p },
	);

	return timingSafeEqual(derived, expected);
}
