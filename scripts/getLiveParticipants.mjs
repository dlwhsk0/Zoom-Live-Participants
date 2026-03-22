import { getCliMeetingId, printResult, zoomGet } from "./lib/zoom.mjs";

const meetingId = getCliMeetingId();

if (!meetingId) {
  console.error("Meeting ID is required. Pass it as argv[2] or set ZOOM_MEETING_ID.");
  process.exit(1);
}

const result = await zoomGet(
  `/metrics/meetings/${encodeURIComponent(meetingId)}/participants`,
  {
    type: "live",
    page_size: 300
  }
);

printResult("live participants", result);

if (result.ok) {
  const participants = Array.isArray(result.body.participants) ? result.body.participants : [];

  console.log("\n[summary]");
  console.log(JSON.stringify({
    total_records: result.body.total_records,
    count: participants.length,
    participants: participants.map((participant) => ({
      id: participant.id,
      user_id: participant.user_id,
      user_name: participant.user_name,
      join_time: participant.join_time,
      leave_time: participant.leave_time
    }))
  }, null, 2));
} else {
  process.exitCode = 1;
}
