import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { SessionParticipant } from "./api.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import { formatDuration, formatLeftAgo, restTier, studyTier } from "./format.ts";
import Portal from "./Portal.tsx";
import { fetchYoutubeInfo, parseStatus } from "./status-link.ts";
import StatusDialog from "./StatusDialog.tsx";

/**
 * 한 번 확인하면 이 페이지가 열려 있는 동안은 다시 묻지 않는다.
 * 매번 물으면 수정할 때마다 걸리적거린다.
 */
let confirmedOnce = false;

const REST_ICON = ["☕", "🥱", "😴", "💤"];

interface Props {
	participant: SessionParticipant;
	now: number;
	onSave: (message: string) => Promise<void>;
	onClose: () => void;
}

/**
 * 타일을 누르면 열리는 프로필 카드.
 *
 * 타일은 90px 이라 이름과 시간밖에 못 담는다. 상태 메시지 전문과
 * 유튜브 링크는 여기서 제대로 보여준다. 수정도 여기서 들어간다.
 */
export default function ProfileDialog({
	participant,
	now,
	onSave,
	onClose,
}: Props) {
	const [asking, setAsking] = useState(false);
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const closeRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeRef.current?.focus();
	}, []);

	const closeRefLatest = useRef(onClose);
	closeRefLatest.current = onClose;

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") closeRefLatest.current();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	function startEditing() {
		// 본인으로 추정되면 묻지 않는다. 확인창은 남의 것을 건드릴 때를 위한 것이다.
		if (participant.isYou || confirmedOnce) {
			setEditing(true);
			return;
		}
		setAsking(true);
	}

	async function commit(next: string) {
		if (next === (participant.statusMessage ?? "")) {
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

	const name = participant.displayName ?? "이름 없음";
	const seconds = participant.onlineSeconds;
	const tier = participant.isPresent ? studyTier(seconds) : 0;
	const rest = participant.isPresent
		? 0
		: restTier(participant.lastOccurredAt, now);
	const { text, youtube } = parseStatus(participant.statusMessage);

	// 제목은 유튜브에서 가져온다. 실패하면 주소만 열 수 있게 두면 된다.
	// 같은 영상은 react-query 가 붙들고 있어 다시 열어도 다시 받지 않는다.
	const video = useQuery({
		queryKey: ["youtube", youtube],
		queryFn: () => fetchYoutubeInfo(youtube as string),
		enabled: youtube !== null,
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});

	if (editing) {
		return (
			<StatusDialog
				name={name}
				value={participant.statusMessage}
				saving={saving}
				onSave={commit}
				onCancel={() => setEditing(false)}
			/>
		);
	}

	if (asking) {
		return (
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
		);
	}

	return (
		<Portal>
			<div
				className="overlay"
				role="dialog"
				aria-modal="true"
				aria-labelledby="profile-title"
				onClick={(event) => {
					if (event.target === event.currentTarget) onClose();
				}}
			>
				<div className="dialog profile">
					<span className={`profile__icon card__icon--tier${tier}`}>
						{participant.isPresent && tier >= 3 && (
							<span className="card__blaze" aria-hidden="true">
								🔥
							</span>
						)}
						<span className="card__person">
							{participant.isPresent ? "🧑‍💻" : REST_ICON[rest]}
						</span>
						{participant.isPresent && tier === 2 && (
							<span className="card__flame" aria-hidden="true">
								🔥
							</span>
						)}
					</span>

					<h2 className="profile__name" id="profile-title">
						{name}
						{participant.isYou && <span className="card__me">(나)</span>}
					</h2>

					<p className="profile__time">
						{participant.isPresent
							? `접속 중 · ${formatDuration(seconds)}`
							: `${formatLeftAgo(participant.lastOccurredAt, now)} · 머문 시간 ${formatDuration(seconds)}`}
					</p>

					{participant.connectionCount > 1 && (
						<p className="profile__meta">{`접속 ${participant.connectionCount}회`}</p>
					)}

					<div className="profile__status">
						{text && <p className="profile__statusText">{text}</p>}
						{/* 링크만 남긴 경우도 있다. 그때는 링크가 곧 내용이다. */}
						{!text && !youtube && (
							<p className="profile__statusEmpty">상태 메시지가 없습니다</p>
						)}

						{youtube && (
							<a
								className="profile__youtube"
								href={youtube}
								target="_blank"
								rel="noopener noreferrer nofollow"
								title={video.data?.title}
							>
								<span className="profile__play" aria-hidden="true">
									▶
								</span>
								<span className="profile__videoTitle">
									{video.data?.title ?? "유튜브에서 열기"}
								</span>
								{video.data?.author && (
									<span className="profile__videoAuthor">
										{video.data.author}
									</span>
								)}
							</a>
						)}
					</div>

					<div className="dialog__actions">
						<button
							ref={closeRef}
							type="button"
							className="dialog__button"
							onClick={onClose}
						>
							닫기
						</button>
						<button
							type="button"
							className="dialog__button dialog__button--primary"
							onClick={startEditing}
						>
							상태 메시지 수정
						</button>
					</div>
				</div>
			</div>
		</Portal>
	);
}
