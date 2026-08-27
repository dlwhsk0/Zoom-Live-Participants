/** DB 연결과 현재 테이블 상태를 확인한다. 마이그레이션 전후 점검용. */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL 이 없습니다. node --env-file=../../.env 로 실행하세요.");
	process.exit(1);
}

const sql = postgres(url, {
	max: 1,
	prepare: false,
	idle_timeout: 5,
	connect_timeout: 10,
});

try {
	const [ver] = await sql`select version()`;
	const [who] = await sql`select current_database() as db, current_user as usr`;
	const tables = await sql`
		select table_name from information_schema.tables
		where table_schema = 'public' order by table_name`;

	console.log("연결 성공:", ver.version.split(" ").slice(0, 2).join(" "));
	console.log("DB:", who.db, "/ 사용자:", who.usr);
	console.log(
		"public 테이블:",
		tables.length ? tables.map((r) => r.table_name).join(", ") : "(없음)",
	);
} catch (error) {
	console.error("연결 실패:", error.code ?? "", error.message);
	process.exitCode = 1;
} finally {
	await sql.end({ timeout: 2 });
}
