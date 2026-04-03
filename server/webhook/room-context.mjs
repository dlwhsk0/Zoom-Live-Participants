export function deriveRoomContext(entry) {
	const object = entry.raw?.payload?.object ?? {};
	const participant = entry.participant ?? {};
	const leaveReason = String(participant.leave_reason ?? "").toLowerCase();
	const breakout = object.breakout_room ?? participant.breakout_room;
	const joinedBreakoutRoom =
		leaveReason.includes("left the meeting to join breakout room");

	if (breakout && typeof breakout === "object") {
		return {
			scope: "breakout",
			detail: breakout.name ?? breakout.room_name ?? "breakout",
		};
	}

	if (joinedBreakoutRoom) {
		return {
			scope: "breakout_left",
			detail: "leave_reason says participant left to join breakout room",
		};
	}

	if (leaveReason.includes("breakout room")) {
		return {
			scope: "breakout_transition",
			detail: "leave_reason mentions breakout room",
		};
	}

	return {
		scope: "main_or_unknown",
		detail: "payload has no explicit breakout field",
	};
}
