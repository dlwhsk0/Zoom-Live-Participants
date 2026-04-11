function getParticipant(entry) {
	return entry.participant ?? entry.raw?.payload?.object?.participant ?? {};
}

function normalizeText(value) {
	return String(value ?? "").trim().toLowerCase();
}

function getParticipantKey(entry) {
	const participant = getParticipant(entry);
	const participantUuid = normalizeText(participant.participant_uuid);

	if (!participantUuid) {
		return "";
	}

	const meetingUuid = normalizeText(entry.meeting_uuid);
	const meetingId = normalizeText(entry.meeting_id);
	const meetingKey = meetingUuid || meetingId || "unknown-meeting";

	return `${meetingKey}:${participantUuid}`;
}

function isTemporaryBreakoutExit(entry) {
	const participant = getParticipant(entry);
	const leaveReason = normalizeText(participant.leave_reason);

	return leaveReason.includes(
		"left the meeting to join breakout room",
	);
}

function findLatestPreviousParticipantEvent(entry, allEntries) {
	if (!Array.isArray(allEntries) || allEntries.length === 0) {
		return null;
	}

	const participantKey = getParticipantKey(entry);

	if (!participantKey) {
		return null;
	}

	const currentIndex = allEntries.indexOf(entry);

	if (currentIndex === -1) {
		return null;
	}

	for (let index = currentIndex + 1; index < allEntries.length; index += 1) {
		const candidate = allEntries[index];

		if (!candidate) {
			continue;
		}

		if (getParticipantKey(candidate) !== participantKey) {
			continue;
		}

		if (
			candidate.event !== "meeting.participant_joined" &&
			candidate.event !== "meeting.participant_left"
		) {
			continue;
		}

		return candidate;
	}

	return null;
}

export function deriveRoomContext(entry, allEntries = []) {
	if (entry.event === "meeting.started") {
		return {
			scope: "meeting_started",
			detail: "회의 세션 시작 이벤트",
		};
	}

	if (entry.event === "meeting.ended") {
		return {
			scope: "meeting_ended",
			detail: "회의 세션 종료 이벤트",
		};
	}

	if (entry.event === "meeting.participant_left") {
		if (isTemporaryBreakoutExit(entry)) {
			return {
				scope: "temporary_breakout_exit",
				detail: "leave_reason says participant left to join breakout room",
			};
		}

		return {
			scope: "meeting_left",
			detail: "일반 회의 완전 퇴장으로 처리",
		};
	}

	if (entry.event === "meeting.participant_joined") {
		const previousEvent = findLatestPreviousParticipantEvent(entry, allEntries);

		if (
			previousEvent &&
			previousEvent.event === "meeting.participant_left" &&
			isTemporaryBreakoutExit(previousEvent)
		) {
			return {
				scope: "breakout_join_inferred",
				detail:
					"same participant_uuid previously had a temporary breakout exit",
			};
		}

		return {
			scope: "main_join",
			detail: "기본 규칙상 메인 회의실 입장으로 처리",
		};
	}

	return {
		scope: "unknown",
		detail: "분류 대상 외 이벤트",
	};
}
