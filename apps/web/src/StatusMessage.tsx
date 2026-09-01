import { useState } from "react";

import ConfirmDialog from "./ConfirmDialog.tsx";
import { parseStatus } from "./status-link.ts";
import StatusDialog from "./StatusDialog.tsx";

/**
 * 한 번 확인하면 이 페이지가 열려 있는 동안은 다시 묻지 않는다.
 * 매번 물으면 수정할 때마다 걸리적거린다.
 */
let confirmedOnce = false;

interface Props {
	name: string;
	value: string | null;
	dimmed: boolean;
	/** IP 로 추정한 본인 여부. 맞으면 확인창을 건너뛴다. */
	isYou: boolean;
	onSave: (message: string) => Promise<void>;
}

export default function StatusMessage({
	name,
	value,
	dimmed,
	isYou,
	onSave,
}: Props) {
	const [editing, setEditing] = useState(false);
	const [asking, setAsking] = useState(false);
	const [saving, setSaving] = useState(false);

	function startEditing() {
		// 본인으로 추정되면 묻지 않는다. 확인창은 남의 것을 건드릴 때를 위한 것이다.
		if (isYou || confirmedOnce) {
			setEditing(true);
			return;
		}
		setAsking(true);
	}

	async function commit(next: string) {
		if (next === (value ?? "")) {
			setEditing(false);
			return;
		}

		setSaving(true);
		try {
			await onSave(next);
			setEditing(false);
		} catch {
			// 실패 사유는 toast 가 알린다. 적은 내용을 잃지 않도록 창을 열어 둔다.
		} finally {
			setSaving(false);
		}
	}

	// 주소는 타일에 그대로 담기엔 길다. 걷어내고 작은 표시로 대신한다.
	const { text, youtube } = parseStatus(value);

	return (
		<>
			<span className="status-row">
				<StatusButton value={text} dimmed={dimmed} onClick={startEditing} />
				{youtube && (
					<a
						className="status__link"
						href={youtube}
						target="_blank"
						// 새 탭이 원래 창을 건드리지 못하게 한다
						rel="noopener noreferrer nofollow"
						title={youtube}
					>
						▶
					</a>
				)}
			</span>

			{asking && (
				<ConfirmDialog
					title="본인입니까?"
					description="상태 메시지는 누구나 바꿀 수 있습니다. 본인 것만 작성해 주세요."
					onConfirm={() => {
						confirmedOnce = true;
						setAsking(false);
						setEditing(true);
					}}
					onCancel={() => setAsking(false)}
				/>
			)}

			{editing && (
				<StatusDialog
					name={name}
					value={value}
					saving={saving}
					onSave={commit}
					onCancel={() => setEditing(false)}
				/>
			)}
		</>
	);
}

/**
 * 길어질수록 글자를 줄인다.
 *
 * 타일 한 칸이 90px 남짓이라 한글 대여섯 자면 한 줄이 찬다.
 * 줄이고 줄바꿈해도 세 줄을 넘기면 잘린다.
 */
function lengthStep(value: string): 1 | 2 | 3 | 4 {
	if (value.length <= 5) return 1;
	if (value.length <= 10) return 2;
	if (value.length <= 15) return 3;
	return 4;
}

function StatusButton({
	value,
	dimmed,
	onClick,
}: {
	value: string;
	dimmed: boolean;
	onClick: () => void;
}) {
	const classes = ["status"];
	if (dimmed) classes.push("status--dim");
	if (value) classes.push(`status--len${lengthStep(value)}`);

	return (
		<button
			type="button"
			className={classes.join(" ")}
			onClick={onClick}
			title="상태 메시지 수정"
		>
			{value ? value : <span className="status__empty">+ 상태</span>}
		</button>
	);
}
