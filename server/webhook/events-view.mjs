import { deriveRoomContext } from "./room-context.mjs";

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

export function normalizeQueryValue(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

export function filterWebhookEvents(events, filters, allEntries = events) {
	return events.filter((entry) => {
		const room = deriveRoomContext(entry, allEntries);
		const participantName = entry.participant?.user_name ?? "";

		if (
			filters.event &&
			normalizeQueryValue(entry.event) !== filters.event
		) {
			return false;
		}

		if (
			filters.meetingId &&
			normalizeQueryValue(entry.meeting_id) !== filters.meetingId
		) {
			return false;
		}

		if (
			filters.userName &&
			!normalizeQueryValue(participantName).includes(filters.userName)
		) {
			return false;
		}

		if (
			filters.roomScope &&
			normalizeQueryValue(room.scope) !== filters.roomScope
		) {
			return false;
		}

		return true;
	});
}

function getEventAppearance(eventName) {
	if (eventName === "meeting.participant_joined") {
		return {
			badge: "참가자 입장",
			tone: "join",
		};
	}

	if (eventName === "meeting.participant_left") {
		return {
			badge: "참가자 퇴장",
			tone: "left",
		};
	}

	if (eventName === "meeting.started") {
		return {
			badge: "회의 시작",
			tone: "meeting-started",
		};
	}

	if (eventName === "meeting.ended") {
		return {
			badge: "회의 종료",
			tone: "meeting-ended",
		};
	}

	return {
		badge: "기타 이벤트",
		tone: "other",
	};
}

function getRoomPresentation(entry, allEntries = []) {
	const room = deriveRoomContext(entry, allEntries);

	if (entry.event === "meeting.started") {
		return {
			badge: "회의 시작",
			title: "회의 시작",
			tone: "meeting-lifecycle",
		};
	}

	if (entry.event === "meeting.ended") {
		return {
			badge: "회의 종료",
			title: "회의 종료",
			tone: "meeting-lifecycle",
		};
	}

	if (room.scope === "temporary_breakout_exit") {
		return {
			badge: "소회의실 입장을 위한 임시 퇴장",
			title: "소회의실 입장을 위한 임시 퇴장",
			tone: "breakout-left",
		};
	}

	if (room.scope === "breakout_join_inferred") {
		return {
			badge: "소회의실 입장",
			title: "소회의실 입장",
			tone: "breakout",
		};
	}

	if (room.scope === "meeting_left") {
		return {
			badge: "회의 완전 퇴장",
			title: "회의 완전 퇴장",
			tone: "transition",
		};
	}

	return {
		badge: "메인 회의실 입장",
		title: "메인 회의실 입장",
		tone: "main",
	};
}

function getMeetingInfo(events, filters) {
	const source = events.find(
		(entry) => entry.meeting_id || entry.meeting_uuid,
	);

	return {
		meetingId: filters.meetingId || source?.meeting_id || "-",
		meetingUuid: source?.meeting_uuid || "-",
	};
}

export function renderEventsPage(events, totalCount, filters, allEntries = events) {
	const meetingInfo = getMeetingInfo(events, filters);
	const temporaryBreakoutExitCount = events.filter(
		(entry) => deriveRoomContext(entry, allEntries).scope === "temporary_breakout_exit",
	).length;
	const breakoutJoinInferredCount = events.filter(
		(entry) => deriveRoomContext(entry, allEntries).scope === "breakout_join_inferred",
	).length;
	const meetingLeftCount = events.filter(
		(entry) => deriveRoomContext(entry, allEntries).scope === "meeting_left",
	).length;
	const mainJoinCount = events.filter(
		(entry) => deriveRoomContext(entry, allEntries).scope === "main_join",
	).length;
	const items = events.length
		? events
				.map((entry) => {
					const participantName = entry.participant?.user_name ?? "-";
					const participantId =
						entry.participant?.user_id ??
						entry.participant?.id ??
						"-";
					const participantUuid =
						entry.participant?.participant_uuid ?? "-";
					const room = deriveRoomContext(entry, allEntries);
					const roomPresentation = getRoomPresentation(entry, allEntries);
					const eventAppearance = getEventAppearance(entry.event);
					const isParticipantEvent =
						entry.event === "meeting.participant_joined" ||
						entry.event === "meeting.participant_left";
					const compactReceivedAt = String(entry.received_at ?? "-")
						.replace("T", " ")
						.replace(".000Z", "Z");
					const participantIdText =
						participantId && participantId !== "-"
							? `ID ${participantId}`
							: "ID 없음";
					const participantUuidText =
						participantUuid && participantUuid !== "-"
							? `UUID ${participantUuid}`
							: "UUID 없음";
					const headlineText = isParticipantEvent
						? participantName
						: eventAppearance.badge;

					return `
          <article class="event tone-${escapeHtml(roomPresentation.tone)} event-tone-${escapeHtml(eventAppearance.tone)}">
            <div class="event-top">
              <div class="event-headline">
                <div class="name-row">
                  <h2>${escapeHtml(headlineText)}</h2>
                  ${isParticipantEvent ? `<span class="inline-user-id">${escapeHtml(participantIdText)}</span>` : ""}
                  ${isParticipantEvent ? `<span class="inline-user-id">${escapeHtml(participantUuidText)}</span>` : ""}
                </div>
              </div>
              <div class="pill-group">
                <span class="pill pill-event">${escapeHtml(eventAppearance.badge)}</span>
                <span class="pill pill-room">${escapeHtml(roomPresentation.badge)}</span>
              </div>
            </div>
            <div class="meta-row">
              <span class="meta-chip">${escapeHtml(compactReceivedAt)}</span>
            </div>
            <details>
              <summary>raw payload</summary>
              <div class="reason-box">
                <div>room_scope: ${escapeHtml(room.scope)}</div>
                <div>room_detail: ${escapeHtml(room.detail)}</div>
              </div>
              <pre>${escapeHtml(JSON.stringify(entry.raw, null, 2))}</pre>
            </details>
          </article>
        `;
				})
				.join("")
		: "<p>아직 수신된 이벤트가 없습니다.</p>";

	return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zoom Webhook Events</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f8fc;
        --panel: #ffffff;
        --panel-strong: #ffffff;
        --line: #d5e2f0;
        --text: #16324f;
        --muted: #5f7a96;
        --primary: #2563eb;
        --main: #2563eb;
        --breakout: #0f766e;
        --breakout-left: #0369a1;
        --transition: #2563eb;
      }
      body {
        margin: 0;
        padding: 28px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: var(--bg);
        color: var(--text);
      }
      .page {
        max-width: 1200px;
        margin: 0 auto;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      h1 {
        margin: 0;
        font-size: 30px;
        letter-spacing: -0.04em;
      }
      p { margin: 0 0 16px; }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin: 0 0 18px;
      }
      .summary-card {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
      }
      .summary-card strong {
        display: block;
        font-size: 28px;
        margin-bottom: 6px;
      }
      .summary-card span {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .meeting-card {
        margin: 0 0 18px;
        padding: 0;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--text);
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
      }
      .meeting-card summary {
        list-style: none;
        cursor: pointer;
        padding: 12px 14px;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .meeting-card summary::-webkit-details-marker {
        display: none;
      }
      .meeting-card summary::after {
        content: "펼치기";
        font-size: 12px;
        color: var(--muted);
        font-weight: 500;
      }
      .meeting-card[open] summary::after {
        content: "숨기기";
      }
      .meeting-card-body {
        padding: 0 14px 14px;
      }
      .meeting-card p {
        margin: 0 0 12px;
        color: var(--muted);
        line-height: 1.6;
        font-size: 13px;
      }
      .meeting-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }
      .meeting-item {
        padding: 10px 12px;
        border-radius: 12px;
        background: #f8fbff;
        border: 1px solid #d9e5f2;
      }
      .meeting-item strong,
      .meeting-item span {
        display: block;
      }
      .meeting-item span {
        font-size: 11px;
        margin-bottom: 6px;
        color: var(--muted);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .toolbar-copy {
        color: var(--muted);
        font-size: 13px;
      }
      .refresh-toggle {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: #f8fbff;
        cursor: pointer;
        user-select: none;
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }
      .refresh-toggle input {
        display: none;
      }
      .refresh-switch {
        position: relative;
        width: 52px;
        height: 30px;
        border-radius: 999px;
        background: #cfdceb;
        transition: background 0.15s ease;
        flex: 0 0 auto;
      }
      .refresh-switch::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: white;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
        transition: transform 0.15s ease;
      }
      .refresh-toggle.is-on {
        border-color: #bfd4ff;
        background: #eef4ff;
      }
      .refresh-toggle.is-on .refresh-switch {
        background: #2563eb;
      }
      .refresh-toggle.is-on .refresh-switch::after {
        transform: translateX(22px);
      }
      .refresh-status {
        display: none;
      }
      form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin: 0 0 16px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
      }
      label {
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
        color: var(--muted);
      }
      input, select {
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel-strong);
        color: var(--text);
      }
      .actions {
        display: flex;
        align-items: end;
        gap: 8px;
      }
      .actions a, .actions button {
        display: inline-block;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 8px 10px;
        background: var(--panel-strong);
        color: inherit;
        text-decoration: none;
        cursor: pointer;
      }
      .actions button {
        background: #1d4ed8;
        color: white;
        border-color: #1d4ed8;
      }
      .event {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 14px;
        margin: 0 0 14px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
      }
      .tone-main {
        border-left: 8px solid var(--main);
      }
      .tone-main .participant-identifiers span,
      .tone-main .pill-room,
      .tone-main .meta-chip,
      .tone-main .reason-box,
      .tone-main pre {
        background: #eef4ff;
        border-color: #cfe0fb;
      }
      .tone-breakout {
        border-left: 8px solid var(--breakout);
      }
      .tone-breakout .participant-identifiers span,
      .tone-breakout .pill-room,
      .tone-breakout .meta-chip,
      .tone-breakout .reason-box,
      .tone-breakout pre {
        background: #ecfaf6;
        border-color: #c9ece1;
      }
      .tone-breakout-left {
        border-left: 8px solid var(--breakout-left);
      }
      .tone-breakout-left .participant-identifiers span,
      .tone-breakout-left .pill-room,
      .tone-breakout-left .meta-chip,
      .tone-breakout-left .reason-box,
      .tone-breakout-left pre {
        background: #edf7fd;
        border-color: #cfe6f6;
      }
      .tone-transition {
        border-left: 8px solid var(--transition);
      }
      .event-tone-join {
        background: #eef9f3;
        border-color: #bfe5d2;
      }
      .event-tone-left {
        background: #fff4f5;
        border-color: #fecdd3;
      }
      .event-tone-meeting-started {
        background: #eef4ff;
        border-color: #cfe0fb;
      }
      .event-tone-meeting-ended {
        background: #f5f7fa;
        border-color: #d6dde6;
      }
      .event-tone-other {
        background: #ffffff;
      }
      .tone-transition .participant-identifiers span,
      .tone-transition .pill-room,
      .tone-transition .meta-chip,
      .tone-transition .reason-box,
      .tone-transition pre {
        background: #eef4ff;
        border-color: #cfe0fb;
      }
      .tone-meeting-lifecycle .participant-identifiers span,
      .tone-meeting-lifecycle .pill-room,
      .tone-meeting-lifecycle .meta-chip,
      .tone-meeting-lifecycle .reason-box,
      .tone-meeting-lifecycle pre {
        background: #f5f7fb;
        border-color: #d9e2ef;
      }
      .event-top {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 14px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .event-headline {
        min-width: 0;
      }
      .name-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0;
        font-size: 21px;
        line-height: 1.2;
        letter-spacing: -0.03em;
      }
      .inline-user-id {
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid #d7e2ee;
        background: rgba(255, 255, 255, 0.72);
        color: var(--muted);
        font-size: 11px;
        line-height: 1;
      }
      .pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 10px;
        background: #f8fbff;
        font-size: 12px;
      }
      .pill-group {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .pill-room {
        background: #eaf3ff;
      }
      .event-tone-join .pill-event {
        background: #e9f8f2;
        border-color: #bfe5d2;
        color: #0f5f49;
      }
      .event-tone-left .pill-event {
        background: #fff1f2;
        border-color: #fecdd3;
        color: #9f1239;
      }
      .event-tone-meeting-started .pill-event {
        background: #eef4ff;
        border-color: #cfe0fb;
        color: #1d4ed8;
      }
      .event-tone-meeting-ended .pill-event {
        background: #f3f4f6;
        border-color: #d1d5db;
        color: #374151;
      }
      .event-tone-other .pill-event {
        background: #f8fafc;
        border-color: #dbe4ee;
        color: #475569;
      }
      .meta-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .meta-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid #d9e5f2;
        background: #f8fbff;
        color: var(--muted);
        font-size: 11px;
      }
      .reason-box {
        margin: 8px 0;
        padding: 8px 10px;
        border-radius: 12px;
        background: #f8fbff;
        border: 1px solid #d9e5f2;
        font-size: 12px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #eff6ff;
        padding: 8px 10px;
        border-radius: 12px;
        border: 1px solid #c8ddfb;
        font-size: 11px;
        line-height: 1.5;
        max-height: 240px;
        overflow: auto;
      }
      .empty {
        padding: 24px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--line);
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main class="page">
    <div class="page-header">
      <h1>Zoom Webhook Events</h1>
      <section class="toolbar">
        <label class="refresh-toggle" for="auto-refresh-toggle">
          <input id="auto-refresh-toggle" type="checkbox" checked />
          <span class="refresh-switch" aria-hidden="true"></span>
          <span>3초 자동 새로고침</span>
        </label>
      </section>
    </div>
    <details class="meeting-card">
      <summary>연결된 미팅 정보</summary>
      <div class="meeting-card-body">
        <div class="meeting-grid">
          <div class="meeting-item">
            <span>회의 ID</span>
            <strong>${escapeHtml(meetingInfo.meetingId)}</strong>
          </div>
          <div class="meeting-item">
            <span>회의 UUID</span>
            <strong>${escapeHtml(meetingInfo.meetingUuid)}</strong>
          </div>
        </div>
      </div>
    </details>
    <form method="get" action="/events">
      <div>
        <label for="event">event</label>
        <select id="event" name="event">
          <option value="">all</option>
          <option value="meeting.participant_joined"${filters.event === "meeting.participant_joined" ? " selected" : ""}>meeting.participant_joined</option>
          <option value="meeting.participant_left"${filters.event === "meeting.participant_left" ? " selected" : ""}>meeting.participant_left</option>
          <option value="meeting.started"${filters.event === "meeting.started" ? " selected" : ""}>meeting.started</option>
          <option value="meeting.ended"${filters.event === "meeting.ended" ? " selected" : ""}>meeting.ended</option>
        </select>
      </div>
      <div>
        <label for="meeting_id">meeting_id</label>
        <input id="meeting_id" name="meeting_id" value="${escapeHtml(filters.meetingId ?? "")}" placeholder="12345678901" />
      </div>
      <div>
        <label for="user_name">user_name</label>
        <input id="user_name" name="user_name" value="${escapeHtml(filters.userName ?? "")}" placeholder="조하나" />
      </div>
      <div>
        <label for="room_scope">room_scope</label>
        <select id="room_scope" name="room_scope">
          <option value="">all</option>
          <option value="main_join"${filters.roomScope === "main_join" ? " selected" : ""}>main_join</option>
          <option value="meeting_left"${filters.roomScope === "meeting_left" ? " selected" : ""}>meeting_left</option>
          <option value="temporary_breakout_exit"${filters.roomScope === "temporary_breakout_exit" ? " selected" : ""}>temporary_breakout_exit</option>
          <option value="breakout_join_inferred"${filters.roomScope === "breakout_join_inferred" ? " selected" : ""}>breakout_join_inferred</option>
        </select>
      </div>
      <div>
        <label for="limit">limit</label>
        <input id="limit" name="limit" value="${escapeHtml(filters.limit ?? "")}" placeholder="100" />
      </div>
      <div class="actions">
        <button type="submit">apply</button>
        <a href="/events">reset</a>
      </div>
    </form>
    <section class="summary">
      <article class="summary-card">
        <strong>${events.length}</strong>
        <span>필터 적용 결과를 기준으로 계산한 이벤트</span>
      </article>
      <article class="summary-card">
        <strong>${mainJoinCount}</strong>
        <span>기본 규칙상 메인 회의실 입장으로 본 이벤트</span>
      </article>
      <article class="summary-card">
        <strong>${meetingLeftCount}</strong>
        <span>회의에서 완전히 나간 퇴장 이벤트</span>
      </article>
      <article class="summary-card">
        <strong>${temporaryBreakoutExitCount}</strong>
        <span>소회의실 입장을 위한 임시 퇴장 이벤트</span>
      </article>
      <article class="summary-card">
        <strong>${breakoutJoinInferredCount}</strong>
        <span>이전 임시 퇴장을 근거로 추론한 소회의실 입장</span>
      </article>
    </section>
    ${items}
    </main>
    <script>
      (() => {
        const STORAGE_KEY = "zoom-events-auto-refresh-enabled";
        const toggle = document.getElementById("auto-refresh-toggle");
        let timer = null;

        function stopRefresh() {
          if (timer) {
            window.clearInterval(timer);
            timer = null;
          }
        }

        function startRefresh() {
          stopRefresh();
          timer = window.setInterval(() => {
            window.location.reload();
          }, 3000);
        }

        function apply(enabled) {
          toggle.checked = enabled;
          toggle.closest(".refresh-toggle").classList.toggle("is-on", enabled);

          if (enabled) {
            startRefresh();
          } else {
            stopRefresh();
          }
        }

        const saved = window.localStorage.getItem(STORAGE_KEY);
        const enabled = saved === null ? true : saved === "true";
        apply(enabled);

        toggle.addEventListener("change", () => {
          const next = toggle.checked;
          window.localStorage.setItem(STORAGE_KEY, String(next));
          apply(next);
        });
      })();
    </script>
  </body>
</html>`;
}
