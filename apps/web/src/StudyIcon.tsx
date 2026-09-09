/**
 * 공부 중인 사람 아이콘.
 *
 * 참가자 타일과 통계 랭킹이 같은 그림을 쓴다. 불꽃 단계가 이 앱의 말버릇이라
 * 두 화면에서 다르게 보이면 같은 뜻으로 읽히지 않는다.
 *
 * 단계별 생김새는 styles.css 의 .card__icon 계열이 정한다.
 *   0~1  사람만
 *   2    사람 앞 오른쪽에 작은 불
 *   3    불이 사람 뒤로 가고 커진다
 *   4    그 불이 파래진다
 */
export default function StudyIcon({
	tier,
	face,
	label,
	small,
}: {
	tier: 0 | 1 | 2 | 3 | 4;
	/** 가운데 얼굴. 접속 중이면 사람, 나갔으면 쉬는 이모지. */
	face: string;
	label: string;
	/** 목록 안에 들어갈 때는 작게 */
	small?: boolean;
}) {
	return (
		<span
			className={`card__icon card__icon--tier${tier}${small ? " card__icon--sm" : ""}`}
			role="img"
			aria-label={label}
		>
			{tier >= 3 && (
				<span className="card__blaze" aria-hidden="true">
					🔥
				</span>
			)}
			<span className="card__person">{face}</span>
			{tier === 2 && (
				<span className="card__flame" aria-hidden="true">
					🔥
				</span>
			)}
		</span>
	);
}
