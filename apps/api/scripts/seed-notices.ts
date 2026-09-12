/**
 * 공지 초기 문구를 넣는다.
 *
 * 이미 같은 문구가 있으면 건너뛴다 — 여러 번 돌려도 안전하다.
 * 운영 중 문구를 바꾸는 것은 이 스크립트가 아니라 DB 에서 한다.
 */
import { getDb } from "../src/db/client.ts";
import { notices } from "../src/db/schema.ts";

const SEED = [
	"닉네임 매핑이 필요하면 조하나에게 연락해주세요",
	"시간이 잘못 나오면 조하나에게 연락해주세요",
	"상태 메시지에 유튜브 링크를 넣을 수 있어요",
	"상태 메시지로 지금 뭘 하고 있는지 공유해주세요",
];

const db = getDb();
const existing = new Set((await db.select({ body: notices.body }).from(notices)).map((r) => r.body));

let added = 0;
for (const [i, body] of SEED.entries()) {
	if (existing.has(body)) continue;
	await db.insert(notices).values({ body, sortOrder: i });
	added += 1;
}

console.log(`공지 ${added}건 추가 (이미 있던 것 ${SEED.length - added}건)`);
process.exit(0);
