/**
 * 로그인 계정을 만든다.
 *
 * 화면에 가입이 없다. 계정은 여기서만 생긴다 — 아무나 어드민을 만들 수 있으면
 * 계정을 둔 의미가 없다.
 *
 * 비밀번호는 인자로 받지 않는다. 셸 히스토리에 남기 때문이다.
 * 환경변수로 넘기거나, 비워 두면 무작위로 만들어 한 번만 보여준다.
 *
 * 실행:
 *   node --env-file=../../.env --experimental-strip-types scripts/create-user.ts <아이디> [role]
 *   PASSWORD=... node --env-file=../../.env --experimental-strip-types scripts/create-user.ts hana admin
 */
import { randomBytes } from "node:crypto";

import { closeDb, getDb } from "../src/db/client.ts";
import { hashPassword } from "../src/http/password.ts";
import { createUser, findUserByUsername } from "../src/repository/users.ts";

// pnpm run 은 인자 앞의 -- 를 그대로 넘긴다. 걸러내지 않으면 "--" 가 아이디가 된다.
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const [username, role = "admin"] = args;

if (!username) {
	console.error("아이디가 필요합니다. 예: create-user.ts hana admin");
	process.exit(1);
}

if (role !== "admin" && role !== "member") {
	console.error(`role 은 admin 또는 member 입니다 (받은 값: ${role})`);
	process.exit(1);
}

const db = getDb();

try {
	if (await findUserByUsername(db, username)) {
		console.error(`이미 있는 아이디입니다: ${username}`);
		process.exit(1);
	}

	// 넘기지 않으면 만들어 준다. 사람이 짓는 것보다 낫다.
	const generated = !process.env.PASSWORD;
	const password = process.env.PASSWORD ?? randomBytes(12).toString("base64url");

	const user = await createUser(db, {
		username,
		passwordHash: await hashPassword(password),
		role,
	});

	console.log(`계정을 만들었습니다: ${user.username} (${user.role})`);

	if (generated) {
		console.log(`비밀번호: ${password}`);
		console.log("이 줄은 다시 볼 수 없습니다. 지금 옮겨 두세요.");
	}
} finally {
	await closeDb();
}
