import { parseStatus } from "./status-link.ts";

/**
 * 타일에 보이는 상태 메시지. **표시 전용이다.**
 *
 * 수정은 프로필 카드에서 한다. 타일 전체가 카드를 여는 버튼이라
 * 여기에 또 누를 것을 두면 서로 먹는다.
 */
export default function StatusMessage({
	value,
	dimmed,
}: {
	value: string | null;
	dimmed: boolean;
}) {
	// 주소는 타일에 담기엔 길다. 걷어내고 표시로 대신한다.
	// 진짜 링크는 프로필 카드에 있다.
	const { text, youtube } = parseStatus(value);

	if (!text && !youtube) {
		return (
			<span className="status status--empty-slot">
				<span className="status__empty">+ 상태</span>
			</span>
		);
	}

	const classes = ["status"];
	if (dimmed) classes.push("status--dim");
	if (text) classes.push(`status--len${lengthStep(text)}`);

	return (
		<span className="status-row">
			<span className={classes.join(" ")}>{text}</span>
			{youtube && (
				<span className="status__link" aria-label="유튜브 링크 있음">
					▶
				</span>
			)}
		</span>
	);
}

/**
 * 길어질수록 글자를 줄인다.
 *
 * 타일 한 칸이 90px 남짓이라 한글 대여섯 자면 한 줄이 찬다.
 * 줄이고 줄바꿈해도 세 줄을 넘기면 잘린다.
 */
function lengthStep(value: string): 1 | 2 | 3 | 4 | 5 {
	if (value.length <= 5) return 1;
	if (value.length <= 10) return 2;
	if (value.length <= 15) return 3;
	if (value.length <= 25) return 4;
	return 5;
}
