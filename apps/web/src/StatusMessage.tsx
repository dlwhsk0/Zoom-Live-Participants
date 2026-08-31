import { useEffect, useRef, useState } from "react";

import { STATUS_MAX_LENGTH } from "./api.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";

/**
 * 한 번 확인하면 이 페이지가 열려 있는 동안은 다시 묻지 않는다.
 * 매번 물으면 수정할 때마다 걸리적거린다.
 */
let confirmedOnce = false;

interface Props {
	value: string | null;
	dimmed: boolean;
	/** IP 로 추정한 본인 여부. 맞으면 확인창을 건너뛴다. */
	isYou: boolean;
	onSave: (message: string) => Promise<void>;
}

export default function StatusMessage({ value, dimmed, isYou, onSave }: Props) {
	const [editing, setEditing] = useState(false);
	const [asking, setAsking] = useState(false);
	const [draft, setDraft] = useState(value ?? "");
	const [saving, setSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	function beginEdit() {
		setDraft(value ?? "");
		setEditing(true);
	}

	function startEditing() {
		// 본인으로 추정되면 묻지 않는다. 확인창은 남의 것을 건드릴 때를 위한 것이다.
		if (isYou || confirmedOnce) {
			beginEdit();
			return;
		}
		setAsking(true);
	}

	async function commit() {
		const next = draft.trim();

		if (next === (value ?? "")) {
			setEditing(false);
			return;
		}

		setSaving(true);
		try {
			await onSave(next);
			setEditing(false);
		} catch {
			// 실패 사유는 toast 가 알린다. 입력한 내용을 잃지 않도록 편집 상태를 유지한다.
		} finally {
			setSaving(false);
		}
	}

	if (asking) {
		return (
			<>
				<StatusButton value={value} dimmed={dimmed} onClick={startEditing} />
				<ConfirmDialog
					title="본인입니까?"
					description="상태 메시지는 누구나 바꿀 수 있습니다. 본인 것만 작성해 주세요."
					onConfirm={() => {
						confirmedOnce = true;
						setAsking(false);
						beginEdit();
					}}
					onCancel={() => setAsking(false)}
				/>
			</>
		);
	}

	if (editing) {
		return (
			<span className="status status--editing">
				<input
					ref={inputRef}
					className="status__input"
					value={draft}
					maxLength={STATUS_MAX_LENGTH}
					disabled={saving}
					placeholder="상태 메시지"
					aria-label="상태 메시지"
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") commit();
						if (event.key === "Escape") setEditing(false);
					}}
				/>
			</span>
		);
	}

	return <StatusButton value={value} dimmed={dimmed} onClick={startEditing} />;
}

/**
 * 길어질수록 글자를 줄인다.
 *
 * 타일 한 칸이 90px 남짓이라 한글 대여섯 자면 한 줄이 찬다.
 * 줄이고 줄바꿈해도 두 줄을 넘기면 잘리고, 전체는 호버할 때 말풍선으로 보여준다.
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
	value: string | null;
	dimmed: boolean;
	onClick: () => void;
}) {
	const classes = ["status"];
	if (dimmed) classes.push("status--dim");
	if (value) classes.push(`status--len${lengthStep(value)}`);

	// 말풍선은 바깥 껍데기가 그린다. 버튼 자신은 넘치는 글자를 잘라내야 해서
	// overflow: hidden 이고, 그 안에 두면 말풍선까지 같이 잘린다.
	return (
		<span className="status-wrap" {...(value ? { "data-full": value } : {})}>
			<button
				type="button"
				className={classes.join(" ")}
				onClick={onClick}
				{...(value ? {} : { title: "상태 메시지 수정" })}
			>
				{value ? value : <span className="status__empty">+ 상태</span>}
			</button>
		</span>
	);
}
