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
			title: "소회의실 퇴장으로 처리합니다",
			description:
				"leave_reason에 'left the meeting to join breakout room' 문구가 있어 메인 회의실 일반 퇴장이 아니라 소회의실 진입을 위한 퇴장으로 판정했습니다.",
			tone: "breakout-left",
		};
	}

	if (room.scope === "breakout") {
		return {
			badge: "소회의실",
			title: isJoin
				? "소회의실 입장으로 보입니다"
				: isLeft
					? "소회의실 퇴장으로 보입니다"
					: "소회의실 관련 이벤트입니다",
			description: `Zoom payload에 소회의실 정보가 직접 포함되었습니다. 식별된 방: ${room.detail}`,
			tone: "breakout",
		};
	}

	if (room.scope === "breakout_transition") {
		return {
			badge: "소회의실 이동 추정",
			title: isLeft
				? "소회의실 이동 또는 소회의실 이탈로 추정됩니다"
				: "소회의실 전환 관련 이벤트로 추정됩니다",
			description:
				"payload의 leave_reason에 breakout room 문구가 있어 메인 회의실 단순 퇴장보다 소회의실 이동 가능성이 높습니다.",
			tone: "transition",
		};
	}

	return {
		badge: "메인 회의실 또는 일반 입퇴장",
		title: isJoin
			? "메인 회의실 입장으로 처리합니다"
			: isLeft
				? "메인 회의실 퇴장으로 처리합니다"
				: "메인 회의실 기준 일반 이벤트입니다",
		description:
			"payload에 소회의실 식별 필드가 없어서 현재는 메인 회의실 이벤트로 간주합니다. 필요하면 raw payload로 재확인하세요.",
		tone: "main",
	};
}

export function renderEventsPage(events, totalCount, filters) {
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
              </div>
              <div class="pill-group">
                <span class="pill pill-event">${escapeHtml(entry.event ?? "-")}</span>
                <span class="pill pill-room">${escapeHtml(roomPresentation.badge)}</span>
              </div>
            </div>
            <p class="lead">${escapeHtml(roomPresentation.title)}</p>
            <p class="explain">${escapeHtml(roomPresentation.description)}</p>
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">수신 시각</span>
                <strong>${escapeHtml(entry.received_at ?? "-")}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">회의 ID</span>
                <strong>${escapeHtml(entry.meeting_id ?? "-")}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">회의 UUID</span>
                <strong>${escapeHtml(entry.meeting_uuid ?? "-")}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">참가자 ID</span>
                <strong>${escapeHtml(participantId)}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">participant_uuid</span>
                <strong>${escapeHtml(participantUuid)}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">내부 판정</span>
                <strong>${escapeHtml(room.scope)}</strong>
              </div>
            </div>
            <details>
              <summary>raw payload와 판정 근거 보기</summary>
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
        --bg: linear-gradient(180deg, #e9f4ff 0%, #f7fbff 55%, #eef7ff 100%);
        --panel: rgba(255, 255, 255, 0.92);
        --panel-strong: #ffffff;
        --line: #b9d3f2;
        --text: #12304d;
        --muted: #58789b;
        --primary: #1c6ed8;
        --primary-soft: #dcecff;
        --main: #1e88e5;
        --main-soft: #e7f3ff;
        --breakout: #0f766e;
        --breakout-soft: #ddfbf5;
        --breakout-left: #0369a1;
        --breakout-left-soft: #e0f2fe;
        --transition: #2563eb;
        --transition-soft: #e0ebff;
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
        box-shadow: 0 14px 30px rgba(30, 92, 180, 0.08);
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
      form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin: 0 0 16px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 14px 30px rgba(30, 92, 180, 0.08);
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
        background: linear-gradient(135deg, #1f7ae0 0%, #4aa4ff 100%);
        color: white;
        border-color: #1f7ae0;
      }
      .event {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px;
        margin: 0 0 14px;
        box-shadow: 0 16px 34px rgba(30, 92, 180, 0.08);
      }
      .tone-main {
        border-left: 8px solid var(--main);
        background: linear-gradient(180deg, var(--panel-strong) 0%, var(--main-soft) 100%);
      }
      .tone-breakout {
        border-left: 8px solid var(--breakout);
        background: linear-gradient(180deg, var(--panel-strong) 0%, var(--breakout-soft) 100%);
      }
      .tone-breakout-left {
        border-left: 8px solid var(--breakout-left);
        background: linear-gradient(180deg, var(--panel-strong) 0%, var(--breakout-left-soft) 100%);
      }
      .tone-transition {
        border-left: 8px solid var(--transition);
        background: linear-gradient(180deg, var(--panel-strong) 0%, var(--transition-soft) 100%);
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
      .pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 10px;
        background: rgba(255,255,255,0.7);
        font-size: 12px;
      }
      .pill-group {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .pill-room {
        background: #dff0ff;
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
        background: rgba(255,255,255,0.72);
        border: 1px solid rgba(150, 188, 232, 0.7);
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
        background: rgba(255,255,255,0.72);
        border: 1px solid rgba(150, 188, 232, 0.7);
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
