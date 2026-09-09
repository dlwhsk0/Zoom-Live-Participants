/**
 * 세로 막대.
 *
 * 시간이 흐르는 값은 가로로 눕히면 추세가 안 보인다. 왼쪽에서 오른쪽으로
 * 시간이 가고 높이가 양이면, 하루의 모양이나 주의 흐름이 한눈에 읽힌다.
 *
 * 이름이 길고 순위가 중요한 것(랭킹)은 여전히 가로 목록이 맞다.
 */
export default function Columns({
	items,
	format,
	labelEvery = 1,
	peakLabel,
}: {
	items: { key: string; label: string; value: number }[];
	/** 값을 사람이 읽는 말로. */
	format: (value: number) => string;
	/** 라벨을 몇 칸마다 적을지. 24칸이면 다 적을 수 없다. */
	labelEvery?: number;
	/** 봉우리를 뭐라고 부를지. 예: "가장 붐비는 시간" */
	peakLabel?: string;
}) {
	const max = Math.max(...items.map((i) => i.value), 1);
	const peak = items.find((i) => i.value === max && i.value > 0);

	return (
		<>
			<div className="cols">
				{items.map((item, index) => {
					const isPeak = item.key === peak?.key;

					return (
						<div className="cols__item" key={item.key}>
							<span
								className={isPeak ? "cols__bar cols__bar--peak" : "cols__bar"}
								style={{
									height: `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%`,
								}}
								title={`${item.label} ${format(item.value)}`}
							/>
							<span className="cols__label">
								{index % labelEvery === 0 ? item.label : ""}
							</span>
						</div>
					);
				})}
			</div>

			{/* 값은 그림 아래 한 줄로. 막대 위에 얹으면 끝 칸에서 잘린다 */}
			{peak && peakLabel && (
				<p className="cols__peak">
					{`${peakLabel} ${peak.label} · ${format(peak.value)}`}
				</p>
			)}
		</>
	);
}
