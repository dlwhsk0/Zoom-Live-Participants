/**
 * 사설 IP 역채움.
 *
 * `private_ip` 는 처음부터 웹훅 원본에 있었지만 정규화 테이블로 옮기지 않았다.
 * 컬럼을 새로 만들었으니 지난 기록에도 채워 넣는다.
 *
 * 원본(`webhook_events`)이 진실이다. 같은 participant_uuid 의 left 이벤트에서
 * 값을 가져온다. 여러 번 나갔으면 가장 최근 것을 쓴다.
 *
 * 여러 번 돌려도 안전하다 — 이미 채워진 행은 건드리지 않는다.
 */
import { sql } from "drizzle-orm";

import { getDb } from "../src/db/client.ts";

const db = getDb();

const updated = await db.execute(sql`
	with latest as (
		select distinct on (
			payload->'payload'->'object'->>'uuid',
			payload->'payload'->'object'->'participant'->>'participant_uuid'
		)
			payload->'payload'->'object'->>'uuid' as meeting_uuid,
			payload->'payload'->'object'->'participant'->>'participant_uuid' as participant_uuid,
			payload->'payload'->'object'->'participant'->>'private_ip' as private_ip
		from webhook_events
		where payload->>'event' = 'meeting.participant_left'
			and payload->'payload'->'object'->'participant'->>'private_ip' is not null
		order by
			payload->'payload'->'object'->>'uuid',
			payload->'payload'->'object'->'participant'->>'participant_uuid',
			received_at desc
	)
	update participants p
	set private_ip = latest.private_ip
	from latest
	where p.meeting_uuid = latest.meeting_uuid
		and p.participant_uuid = latest.participant_uuid
		and p.private_ip is null
`);

const [row] = await db.execute(sql`
	select count(*)::int as filled,
	       count(*) filter (where private_ip is null)::int as empty
	from participants
`);

console.log(`역채움 완료 · 영향 ${updated.count ?? "?"}행`);
console.log(`participants 전체 ${row?.filled ?? 0}행 중 사설 IP 없는 행 ${row?.empty ?? 0}개`);
process.exit(0);
