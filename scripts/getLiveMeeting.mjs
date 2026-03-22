import { getCliMeetingId, printResult, zoomGet } from "./lib/zoom.mjs";

const meetingId = getCliMeetingId();

if (!meetingId) {
  console.error("Meeting ID is required. Pass it as argv[2] or set ZOOM_MEETING_ID.");
  process.exit(1);
}

const result = await zoomGet(`/metrics/meetings/${encodeURIComponent(meetingId)}`, {
  type: "live"
});

printResult("live meeting", result);

if (result.ok) {
  console.log("\n[summary]");
  console.log(JSON.stringify({
    id: result.body.id,
    uuid: result.body.uuid,
    topic: result.body.topic,
    participants: result.body.participants,
    start_time: result.body.start_time
  }, null, 2));
} else {
  process.exitCode = 1;
}
