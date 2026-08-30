/**
 * webhook_events.payload 원본에서 public_ip 를 채운다.
 *
 * public_ip 컬럼을 나중에 추가했기 때문에, 그 이전에 수신한 행은 값이 비어 있다.
 * 원본을 그대로 보관해 둔 덕분에 재처리로 복구할 수 있다.
 *
 * 실행: node --env-file=../../.env --experimental-strip-types scripts/backfill-public-ip.ts --yes
 */
import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../src/db/client.ts";

const db = getDb();

const [before] = await db.execute<{ events: number; people: number }>(sql`
	select
		(select count(*) from participant_events where public_ip is null)::int as events,
		(select count(*) from participants where public_ip is null)::int as people
`);

console.log("public_ip 가 비어 있는 행:");
console.log(`  participant_events = ${before?.events ?? 0}`);
console.log(`  participants       = ${before?.people ?? 0}`);

if ((before?.events ?? 0) + (before?.people ?? 0) === 0) {
	console.log("\n채울 것이 없습니다.");
	await closeDb();
	process.exit(0);
}

if (!process.argv.includes("--yes")) {
	console.log("\n실제로 채우려면 --yes 를 붙여 다시 실행하세요.");
	await closeDb();
	process.exit(1);
}

// 원본 payload 에서 participant_uuid + 발생 시각으로 매칭한다.
await db.execute(sql`
	update participant_events pe
	set public_ip = src.public_ip
	from (
		select
			we.payload -> 'payload' -> 'object' -> 'participant' ->> 'participant_uuid' as participant_uuid,
			coalesce(
				we.payload -> 'payload' -> 'object' -> 'participant' ->> 'join_time',
				we.payload -> 'payload' -> 'object' -> 'participant' ->> 'leave_time'
			)::timestamptz as occurred_at,
			we.payload -> 'payload' -> 'object' -> 'participant' ->> 'public_ip' as public_ip
		from webhook_events we
		where we.payload ->> 'event' in ('meeting.participant_joined', 'meeting.participant_left')
	) src
	where pe.public_ip is null
	  and pe.participant_uuid = src.participant_uuid
	  and pe.occurred_at = src.occurred_at
	  and src.public_ip is not null
	  and src.public_ip <> ''
`);

// participants 는 정규화된 이벤트에서 가장 최근 값을 가져온다.
await db.execute(sql`
	update participants p
	set public_ip = src.public_ip
	from (
		select distinct on (meeting_uuid, participant_uuid)
			meeting_uuid, participant_uuid, public_ip
		from participant_events
		where public_ip is not null
		order by meeting_uuid, participant_uuid, occurred_at desc
	) src
	where p.public_ip is null
	  and p.meeting_uuid = src.meeting_uuid
	  and p.participant_uuid = src.participant_uuid
`);

const [after] = await db.execute<{ events: number; people: number }>(sql`
	select
		(select count(*) from participant_events where public_ip is null)::int as events,
		(select count(*) from participants where public_ip is null)::int as people
`);

console.log("\n백필 후 남은 빈 행:");
console.log(`  participant_events = ${after?.events ?? 0}`);
console.log(`  participants       = ${after?.people ?? 0}`);

await closeDb();
