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

export function filterWebhookEvents(events, filters) {
	return events.filter((entry) => {
		const room = deriveRoomContext(entry);
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

export function renderEventsPage(events, totalCount, filters) {
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
					const room = deriveRoomContext(entry);

					return `
          <article class="event">
            <div class="meta">
              <strong>${escapeHtml(entry.event ?? "-")}</strong>
              <span>${escapeHtml(entry.received_at ?? "-")}</span>
              <span class="pill">${escapeHtml(room.scope)}</span>
            </div>
            <div>meeting_id: ${escapeHtml(entry.meeting_id ?? "-")}</div>
            <div>meeting_uuid: ${escapeHtml(entry.meeting_uuid ?? "-")}</div>
            <div>participant_name: ${escapeHtml(participantName)}</div>
            <div>participant_id: ${escapeHtml(participantId)}</div>
            <div>participant_uuid: ${escapeHtml(participantUuid)}</div>
            <div>room_context: ${escapeHtml(room.scope)}</div>
            <div>room_detail: ${escapeHtml(room.detail)}</div>
            <details>
              <summary>raw payload</summary>
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
    <meta http-equiv="refresh" content="3" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zoom Webhook Events</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        padding: 24px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #f4f1ea;
        color: #1e1b16;
      }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 16px; }
      form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin: 0 0 16px;
        background: #fffdf8;
        border: 1px solid #d8d1c3;
        border-radius: 10px;
        padding: 14px;
      }
      label {
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }
      input, select {
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
        border: 1px solid #c9c1b4;
        border-radius: 8px;
        background: #fff;
      }
      .actions {
        display: flex;
        align-items: end;
        gap: 8px;
      }
      .actions a, .actions button {
        display: inline-block;
        border: 1px solid #c9c1b4;
        border-radius: 8px;
        padding: 8px 10px;
        background: #fff;
        color: inherit;
        text-decoration: none;
        cursor: pointer;
      }
      .event {
        background: #fffdf8;
        border: 1px solid #d8d1c3;
        border-radius: 10px;
        padding: 14px;
        margin: 0 0 12px;
      }
      .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .pill {
        border: 1px solid #c9c1b4;
        border-radius: 999px;
        padding: 2px 8px;
        background: #f7f3ea;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #f7f3ea;
        padding: 10px;
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <h1>Zoom Webhook Events</h1>
    <p>저장된 전체 이벤트 ${totalCount}건 중 현재 ${events.length}건을 표시합니다. 3초마다 새로고침됩니다.</p>
    <form method="get" action="/events">
      <div>
        <label for="event">event</label>
        <input id="event" name="event" value="${escapeHtml(filters.event ?? "")}" placeholder="meeting.participant_joined" />
      </div>
      <div>
        <label for="meeting_id">meeting_id</label>
        <input id="meeting_id" name="meeting_id" value="${escapeHtml(filters.meetingId ?? "")}" placeholder="89791995600" />
      </div>
      <div>
        <label for="user_name">user_name</label>
        <input id="user_name" name="user_name" value="${escapeHtml(filters.userName ?? "")}" placeholder="이현호" />
      </div>
      <div>
        <label for="room_scope">room_scope</label>
        <select id="room_scope" name="room_scope">
          <option value="">all</option>
          <option value="main_or_unknown"${filters.roomScope === "main_or_unknown" ? " selected" : ""}>main_or_unknown</option>
          <option value="breakout_transition"${filters.roomScope === "breakout_transition" ? " selected" : ""}>breakout_transition</option>
          <option value="breakout"${filters.roomScope === "breakout" ? " selected" : ""}>breakout</option>
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
    ${items}
  </body>
</html>`;
}
