/**
 * 로컬 소스의 지문을 출력한다.
 *
 * 배포된 서버의 GET /health 가 돌려주는 version 과 비교하면
 * 그 서버가 지금 이 코드로 돌고 있는지 바로 알 수 있다.
 *
 * 실행: node scripts/print-fingerprint.mjs
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

function collect(dir, out = []) {
	for (const entry of readdirSync(dir).sort()) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) collect(full, out);
		else if (entry.endsWith(".ts")) out.push(full);
	}
	return out;
}

const hash = createHash("sha256");
for (const file of collect(srcDir).sort()) {
	hash.update(file.slice(srcDir.length));
	hash.update(readFileSync(file));
}

console.log(hash.digest("hex").slice(0, 12));
