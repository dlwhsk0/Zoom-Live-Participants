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

export const zoomRawWebhookEvents = pgTable(
	"zoom_raw_webhook_events",
	{
		rawId: uuid("raw_id").defaultRandom().primaryKey(),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		payloadJson: jsonb("payload_json").notNull(),
		dedupeKey: text("dedupe_key").notNull(),
	},
	(table) => ({
		dedupeKeyUnique: uniqueIndex("uq_zoom_raw_webhook_events_dedupe_key").on(
			table.dedupeKey,
		),
		receivedAtIdx: index("idx_zoom_raw_webhook_events_received_at").on(
			table.receivedAt,
		),
	}),
);

export const participantEvents = pgTable(
	"participant_events",
	{
		eventId: uuid("event_id").defaultRandom().primaryKey(),
		rawId: uuid("raw_id").notNull(),
		eventName: text("event_name").notNull(),
		meetingUuid: text("meeting_uuid").notNull(),
		meetingId: text("meeting_id").notNull(),
		participantUuid: text("participant_uuid"),
		userName: text("user_name"),
		leaveReason: text("leave_reason"),
		roomScope: text("room_scope").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		rawIdIdx: index("idx_participant_events_raw_id").on(table.rawId),
		meetingUuidIdx: index("idx_participant_events_meeting_uuid").on(
			table.meetingUuid,
		),
		meetingIdIdx: index("idx_participant_events_meeting_id").on(table.meetingId),
		participantUuidIdx: index("idx_participant_events_participant_uuid").on(
			table.participantUuid,
		),
		eventNameIdx: index("idx_participant_events_event_name").on(table.eventName),
		roomScopeIdx: index("idx_participant_events_room_scope").on(table.roomScope),
		createdAtIdx: index("idx_participant_events_created_at").on(table.createdAt),
	}),
);

export const slackDeliveries = pgTable(
	"slack_deliveries",
	{
		messageId: uuid("message_id").defaultRandom().primaryKey(),
		eventId: uuid("event_id").notNull(),
		templateKey: text("template_key").notNull(),
		status: text("status").notNull(),
		errorMessage: text("error_message"),
		channelId: text("channel_id"),
		messageTs: text("message_ts"),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		eventIdIdx: index("idx_slack_deliveries_event_id").on(table.eventId),
		statusIdx: index("idx_slack_deliveries_status").on(table.status),
		channelMessageIdx: index("idx_slack_deliveries_channel_id_message_ts").on(
			table.channelId,
			table.messageTs,
		),
		createdAtIdx: index("idx_slack_deliveries_created_at").on(table.createdAt),
	}),
);

export const slackMessageTemplates = pgTable(
	"slack_message_templates",
	{
		templateId: uuid("template_id").defaultRandom().primaryKey(),
		templateKey: text("template_key").notNull(),
		eventName: text("event_name").notNull(),
		text: text("text").notNull(),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		templateKeyUnique: uniqueIndex("uq_slack_message_templates_template_key").on(
			table.templateKey,
		),
		eventNameIdx: index("idx_slack_message_templates_event_name").on(
			table.eventName,
		),
		isActiveIdx: index("idx_slack_message_templates_is_active").on(table.isActive),
	}),
);

