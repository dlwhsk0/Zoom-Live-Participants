/**
 * 계정 비밀번호를 바꾼다.
 *
 * 화면에 비밀번호 변경이 없다. 계정을 만들 때와 같은 이유다 —
 * 이 화면에 쓰는 사람이 한둘이라 UI 를 둘 값이 없다.
 *
 * 비밀번호는 인자로 받지 않는다. 셸 히스토리에 남기 때문이다.
 * 환경변수로 넘기거나, 비워 두면 무작위로 만들어 한 번만 보여준다.
 *
 * **이미 발급된 세션은 끊기지 않는다.** 세션 테이블이 없어 서버가 목록을
 * 들고 있지 않기 때문이다. 전부 끊으려면 SESSION_SECRET 을 바꾼다.
 *
 * 실행:
 *   PASSWORD=... node --env-file=../../.env --experimental-strip-types scripts/set-password.ts <아이디>
 */
import { randomBytes } from "node:crypto";

import { closeDb, getDb } from "../src/db/client.ts";
import { hashPassword } from "../src/http/password.ts";
import { findUserByUsername, setPassword } from "../src/repository/users.ts";

// pnpm run 은 인자 앞의 -- 를 그대로 넘긴다
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const [username] = args;

if (!username) {
	console.error("아이디가 필요합니다. 예: set-password.ts techeer");
	process.exit(1);
}

const db = getDb();

try {
	if (!(await findUserByUsername(db, username))) {
		console.error(`없는 아이디입니다: ${username}`);
		process.exit(1);
	}

	const generated = !process.env.PASSWORD;
	const password = process.env.PASSWORD ?? randomBytes(12).toString("base64url");

	if (!(await setPassword(db, username, await hashPassword(password)))) {
		console.error("바꾸지 못했습니다");
		process.exit(1);
	}

	console.log(`비밀번호를 바꿨습니다: ${username}`);

	if (generated) {
		console.log(`비밀번호: ${password}`);
		console.log("이 줄은 다시 볼 수 없습니다. 지금 옮겨 두세요.");
	}

	console.log("이미 로그인된 세션은 그대로 살아 있습니다.");
	console.log("전부 끊으려면 SESSION_SECRET 을 바꾸고 API 를 다시 띄우세요.");
} finally {
	await closeDb();
}
