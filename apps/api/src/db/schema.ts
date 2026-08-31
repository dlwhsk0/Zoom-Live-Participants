import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

/**
 * 원본 웹훅 보존.
 *
 * 정규화 결과만 저장하면 판정 규칙이 바뀌었을 때 과거 데이터를 다시 만들 수 없다.
 * 실제로 v1의 leave_reason 기반 분류가 틀린 것으로 확인되어 규칙을 갈아엎었다.
 * 원본이 있으면 재처리로 복구할 수 있다.
 */
export const webhookEvents = pgTable(
	"webhook_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		payload: jsonb("payload").notNull(),
		/** meeting_uuid | participant_uuid | event_type | occurred_at */
		dedupeKey: text("dedupe_key").notNull(),
	},
	(table) => ({
		dedupeKeyUnique: uniqueIndex("uq_webhook_events_dedupe_key").on(
			table.dedupeKey,
		),
		receivedAtIdx: index("idx_webhook_events_received_at").on(table.receivedAt),
	}),
);

/**
 * 로그성 테이블. 참가자 입퇴장 이벤트를 정규화해 시간순으로 쌓는다.
 *
 * occurredAt 이 판정의 기준이다. receivedAt(수신 시각)은 도착 순서가
 * 뒤바뀌므로 정렬에 쓸 수 없다. 실측상 방 이동 쌍 40건 중 17건은
 * joined 가 left 보다 먼저 도착했다.
 */
export const participantEvents = pgTable(
	"participant_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		/** webhook_events 참조. FK 제약은 두지 않는다. */
		webhookEventId: uuid("webhook_event_id").notNull(),
		/** 회의방 번호. 세션이 바뀌어도 고정이다. */
		meetingId: text("meeting_id").notNull(),
		/** 회의 세션. 회의를 새로 열 때마다 바뀐다. */
		meetingUuid: text("meeting_uuid").notNull(),
		/** 세션 내 참가자 동일성 키. 방을 옮겨도 유지된다. */
		participantUuid: text("participant_uuid").notNull(),
		/** joined | left */
		eventType: text("event_type").notNull(),
		/** join_time 또는 leave_time. 정렬·판정의 기준. */
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
		/** 표시용. 판정에 쓰지 않는다. 사용자가 임의로 바꿀 수 있다. */
		displayName: text("display_name"),
		/** 방 세션마다 새로 발급된다. 디버깅 참고용. */
		userId: text("user_id"),
		/**
		 * 공인 IP. 재접속 판별에 쓴다.
		 * participant_uuid 는 접속마다 새로 발급되지만 public_ip 는 유지된다.
		 */
		publicIp: text("public_ip"),
		/** 원문 보존. 판정에 쓰지 않는다. */
		leaveReason: text("leave_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		presenceIdx: index("idx_participant_events_presence").on(
			table.meetingUuid,
			table.participantUuid,
			table.occurredAt,
		),
		meetingOccurredIdx: index("idx_participant_events_meeting_occurred").on(
			table.meetingUuid,
			table.occurredAt,
		),
	}),
);

/**
 * 사용자 목록. 회의 세션 단위 참가자와 현재 접속 상태.
 *
 * participant_events 로부터 upsert 로 갱신한다.
 * 갱신 규칙은 판정 규칙과 같다 —
 * (occurredAt 이 더 늦거나) 또는 (occurredAt 이 같고 들어온 쪽이 joined 인) 경우에만 진행한다.
 * 이 조건 덕분에 웹훅이 순서 없이 도착하거나 중복 수신되어도 결과가 같다.
 *
 * participantUuid 는 회의 세션 단위로 발급되므로 사람 단위 식별자가 아니다.
 * 날짜를 가로지르는 동일인 판별은 이 테이블로 할 수 없다.
 */
export const participants = pgTable(
	"participants",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		/** 회의방 번호. 세션이 바뀌어도 고정이다. */
		meetingId: text("meeting_id").notNull(),
		/** 회의 세션. 회의를 새로 열 때마다 바뀐다. */
		meetingUuid: text("meeting_uuid").notNull(),
		participantUuid: text("participant_uuid").notNull(),
		/**
		 * 이 회의 세션이 시작된 시각.
		 *
		 * Zoom 이 모든 웹훅 payload 의 object.start_time 으로 보내준다.
		 * 세션(meeting_uuid)마다 고유하고 세션 안에서는 항상 같은 값이라,
		 * 어느 행에서 읽어도 결과가 같다 — fixture 4세션 162건 전수 확인.
		 *
		 * meeting.started 웹훅을 못 받아도 알 수 있다는 것이 핵심이다.
		 * 서버를 늦게 켜서 앞부분을 통째로 놓쳤어도 시작 시각은 정확하다.
		 */
		meetingStartedAt: timestamp("meeting_started_at", { withTimezone: true }),
		/** 마지막으로 관측된 표시 이름 */
		displayName: text("display_name"),
		/** 재접속 판별용. 상세는 participant_events.public_ip 주석 참고. */
		publicIp: text("public_ip"),
		/**
		 * 참가자가 직접 적는 상태 메시지. 권한을 두지 않는다.
		 * 재접속하면 새 행이 생기므로, 조회 시 합칠 때
		 * statusUpdatedAt 이 가장 최근인 값을 고른다.
		 */
		statusMessage: text("status_message"),
		statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
		/** 현재 접속 여부. lastEventType 에서 파생되지만 조회 편의를 위해 둔다. */
		isPresent: boolean("is_present").notNull(),
		/** joined | left */
		lastEventType: text("last_event_type").notNull(),
		/** 마지막으로 반영된 이벤트의 발생 시각. upsert 비교 기준. */
		lastOccurredAt: timestamp("last_occurred_at", {
			withTimezone: true,
		}).notNull(),
		firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }),
		/**
		 * 우리가 이 참가자를 처음 인지한 시각.
		 *
		 * first_joined_at(Zoom 기준 입장)과 크게 차이나면
		 * 그동안 웹훅을 못 받고 있었다는 뜻이다.
		 * 수집 공백을 사후에 알아낼 유일한 단서다.
		 */
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		identityUnique: uniqueIndex("uq_participants_meeting_participant").on(
			table.meetingUuid,
			table.participantUuid,
		),
		presentIdx: index("idx_participants_present").on(
			table.meetingUuid,
			table.isPresent,
		),
		/** 회의방의 최신 세션을 찾을 때 쓴다. */
		latestSessionIdx: index("idx_participants_latest_session").on(
			table.meetingId,
			table.lastOccurredAt,
		),
	}),
);

/**
 * 어드민이 손으로 고친 기록.
 *
 * 사람을 합치거나 떼어내는 일은 되돌릴 수 있어야 하고,
 * 누가 언제 무엇을 바꿨는지 남아야 한다. 원본(webhook_events,
 * participant_events)은 건드리지 않으므로 여기에 before 를 담아두면
 * 언제든 되돌릴 수 있다.
 */
export const adminActions = pgTable(
	"admin_actions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** 무엇을 했는가. 지금은 rename 하나뿐이다. */
		action: text("action").notNull(),
		meetingUuid: text("meeting_uuid"),
		/** { targets: [{ participantUuid, before }], after } */
		detail: jsonb("detail").notNull(),
		/** 토큰만으로 여는 화면이라 누구인지는 모른다. IP 라도 남긴다. */
		clientIp: text("client_ip"),
	},
	(table) => ({
		createdAtIdx: index("idx_admin_actions_created_at").on(table.createdAt),
	}),
);
