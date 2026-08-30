import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 실행 중인 소스의 지문.
 *
 * 배포가 실제로 반영됐는지 확인할 방법이 없어 여러 번 헤맸다.
 * 도커 레이어 캐시 때문에 빌드는 성공했는데 옛 소스가 그대로 담긴 적이 있었다.
 *
 * 빌드 인자나 git 에 의존하지 않는다. 컨테이너에 git 이 없고
 * .dockerignore 가 .git 을 제외하기 때문이다.
 * 대신 기동 시점에 src 아래 .ts 파일들의 내용을 해시한다.
 * 소스가 한 글자라도 다르면 값이 달라진다.
 */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir).sort()) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			collectSourceFiles(full, out);
		} else if (entry.endsWith(".ts")) {
			out.push(full);
		}
	}
	return out;
}

function computeFingerprint(): string {
	try {
		const srcDir = fileURLToPath(new URL(".", import.meta.url));
		const hash = createHash("sha256");

		// 경로를 정렬해 넣어 같은 소스면 항상 같은 값이 나오게 한다
		for (const file of collectSourceFiles(srcDir).sort()) {
			hash.update(file.slice(srcDir.length));
			hash.update(readFileSync(file));
		}

		return hash.digest("hex").slice(0, 12);
	} catch {
		return "unknown";
	}
}

/** 기동 시 한 번만 계산한다. */
export const SOURCE_FINGERPRINT = computeFingerprint();

export const STARTED_AT = new Date().toISOString();
