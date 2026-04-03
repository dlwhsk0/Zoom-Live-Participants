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

function getEventKindLabel(eventName) {
	if (eventName === "meeting.participant_joined") {
		return "입장 이벤트";
	}

	if (eventName === "meeting.participant_left") {
		return "퇴장 이벤트";
	}

	if (eventName === "meeting.started") {
		return "회의 시작";
	}

	if (eventName === "meeting.ended") {
		return "회의 종료";
	}

	return "기타 이벤트";
}

function getRoomPresentation(entry) {
	const room = deriveRoomContext(entry);
	const isJoin = entry.event === "meeting.participant_joined";
	const isLeft = entry.event === "meeting.participant_left";

	if (room.scope === "breakout_left") {
		return {
			badge: "소회의실 퇴장",
			title: "소회의실 퇴장",
			description:
				"leave_reason에 'left the meeting to join breakout room' 문구가 있음. 메인 회의실 일반 퇴장이 아니라 소회의실 진입을 위한 퇴장으로 판정함.",
			tone: "breakout-left",
		};
	}

	if (room.scope === "breakout") {
		return {
			badge: "소회의실",
			title: isJoin
				? "소회의실 입장"
				: isLeft
					? "소회의실 퇴장"
					: "소회의실 관련 이벤트",
			description: `Zoom payload에 소회의실 정보가 직접 포함됨. 식별된 방: ${room.detail}`,
			tone: "breakout",
		};
	}

	if (room.scope === "breakout_transition") {
		return {
			badge: "소회의실 이동 추정",
			title: isLeft
				? "소회의실 이동 또는 소회의실 이탈로 추정됨"
				: "소회의실 전환 관련 이벤트로 추정됨",
			description:
				"payload의 leave_reason에 breakout room 문구가 있어 메인 회의실 단순 퇴장보다 소회의실 이동 가능성이 높음.",
			tone: "transition",
		};
	}

	return {
		badge: "메인 회의실 또는 일반 입퇴장",
		title: isJoin
			? "메인 회의실 입장"
			: isLeft
				? "메인 회의실 퇴장"
				: "메인 회의실 기준 일반 이벤트",
		description:
			"payload에 소회의실 식별 필드 없음. 메인 회의실 이벤트로 간주함.",
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

export function renderEventsPage(events, totalCount, filters) {
	const meetingInfo = getMeetingInfo(events, filters);
	const breakoutLeftCount = events.filter(
		(entry) => deriveRoomContext(entry).scope === "breakout_left",
	).length;
	const breakoutCount = events.filter(
		(entry) => deriveRoomContext(entry).scope === "breakout",
	).length;
	const transitionCount = events.filter(
		(entry) => deriveRoomContext(entry).scope === "breakout_transition",
	).length;
	const mainCount =
		events.length - breakoutCount - breakoutLeftCount - transitionCount;
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
					const roomPresentation = getRoomPresentation(entry);
					const eventKindLabel = getEventKindLabel(entry.event);

					return `
          <article class="event tone-${escapeHtml(roomPresentation.tone)}">
            <div class="event-top">
              <div>
                <div class="eyebrow">${escapeHtml(eventKindLabel)}</div>
                <h2>${escapeHtml(participantName)}</h2>
                <div class="participant-identifiers">
                  <span>참가자 ID: ${escapeHtml(participantId)}</span>
                  <span>participant_uuid: ${escapeHtml(participantUuid)}</span>
                </div>
              </div>
              <div class="pill-group">
                <span class="pill pill-event">${escapeHtml(entry.event ?? "-")}</span>
                <span class="pill pill-room">${escapeHtml(roomPresentation.badge)}</span>
              </div>
            </div>
            <p class="lead">[${escapeHtml(room.scope)}] ${escapeHtml(roomPresentation.title)}</p>
            <p class="explain">${escapeHtml(roomPresentation.description)}</p>
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">수신 시각</span>
                <strong>${escapeHtml(entry.received_at ?? "-")}</strong>
              </div>
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
    <meta http-equiv="refresh" content="3" />
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
      h1 {
        margin: 0 0 8px;
        font-size: 30px;
        letter-spacing: -0.04em;
      }
      p { margin: 0 0 16px; }
      .intro {
        margin-bottom: 18px;
        color: var(--muted);
        line-height: 1.7;
      }
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
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: #0f2742;
        color: #f8fbff;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
      }
      .meeting-card h2 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .meeting-card p {
        margin: 0 0 14px;
        color: rgba(248, 251, 255, 0.76);
        line-height: 1.7;
      }
      .meeting-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .meeting-item {
        padding: 12px;
        border-radius: 14px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
      }
      .meeting-item strong,
      .meeting-item span {
        display: block;
      }
      .meeting-item span {
        font-size: 11px;
        margin-bottom: 6px;
        color: rgba(248, 251, 255, 0.62);
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
        padding: 18px;
        margin: 0 0 14px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
      }
      .tone-main {
        border-left: 8px solid var(--main);
        background: #ffffff;
      }
      .tone-breakout {
        border-left: 8px solid var(--breakout);
        background: #ffffff;
      }
      .tone-breakout-left {
        border-left: 8px solid var(--breakout-left);
        background: #ffffff;
      }
      .tone-transition {
        border-left: 8px solid var(--transition);
        background: #ffffff;
      }
      .event-top {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 14px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .eyebrow {
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 6px;
      }
      h2 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
        letter-spacing: -0.03em;
      }
      .participant-identifiers {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
      }
      .participant-identifiers span {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        background: #f8fbff;
        border: 1px solid #d9e5f2;
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
      .lead {
        margin: 0 0 8px;
        font-size: 16px;
        font-weight: 700;
      }
      .explain {
        margin: 0 0 14px;
        color: var(--muted);
        line-height: 1.7;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }
      .meta-item {
        background: #f8fbff;
        border: 1px solid #d9e5f2;
        border-radius: 14px;
        padding: 12px;
      }
      .meta-label {
        display: block;
        font-size: 11px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .reason-box {
        margin: 10px 0;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f8fbff;
        border: 1px solid #d9e5f2;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #eff6ff;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid #c8ddfb;
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
    <h1>Zoom Webhook Events</h1>
    <p class="intro">최근 수신한 Zoom webhook 이벤트를 메인 회의실, 소회의실, 소회의실 이동 추정으로 나눠서 보여줍니다. 현재 페이지는 저장된 전체 이벤트 ${totalCount}건 중 ${events.length}건을 표시하며 3초마다 자동 새로고침됩니다.</p>
    <section class="summary">
      <article class="summary-card">
        <strong>${events.length}</strong>
        <span>현재 화면에 표시 중인 이벤트 수입니다. 필터 적용 결과를 기준으로 계산합니다.</span>
      </article>
      <article class="summary-card">
        <strong>${mainCount}</strong>
        <span>소회의실 근거가 없어 메인 회의실 또는 일반 입퇴장으로 처리한 이벤트 수입니다.</span>
      </article>
      <article class="summary-card">
        <strong>${breakoutLeftCount}</strong>
        <span>leave_reason 기준으로 소회의실 진입을 위한 퇴장으로 확정한 이벤트 수입니다.</span>
      </article>
      <article class="summary-card">
        <strong>${breakoutCount}</strong>
        <span>payload에 소회의실 정보가 직접 들어 있어 소회의실 이벤트로 확정한 수입니다.</span>
      </article>
      <article class="summary-card">
        <strong>${transitionCount}</strong>
        <span>leave_reason 등을 근거로 소회의실 이동 또는 전환으로 추정한 이벤트 수입니다.</span>
      </article>
    </section>
    <section class="meeting-card">
      <h2>연결된 미팅 정보</h2>
      <p>카드별로 반복 표시하지 않고, 현재 화면에 표시 중인 이벤트 기준 회의 식별자를 여기서만 보여줍니다.</p>
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
    </section>
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
          <option value="breakout_left"${filters.roomScope === "breakout_left" ? " selected" : ""}>breakout_left</option>
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
    <p class="intro">카드 상단의 파란 배지는 이벤트 종류를, 큰 설명 문장은 현재 시스템이 메인 회의실인지 소회의실인지 어떻게 판정했는지를 한국어로 설명합니다. 소회의실 관련 여부가 애매하면 raw payload와 판정 근거를 함께 열어 확인할 수 있습니다.</p>
    ${items}
    </main>
  </body>
</html>`;
}
