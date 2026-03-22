import { getCliMeetingId, printResult, zoomGet } from "./lib/zoom.mjs";

const meetingId = getCliMeetingId();

if (!meetingId) {
  console.error("Meeting ID is required. Pass it as argv[2] or set ZOOM_MEETING_ID.");
  process.exit(1);
}

const result = await zoomGet(`/past_meetings/${encodeURIComponent(meetingId)}/instances`);

printResult("past meeting instances", result);

if (result.ok) {
  const meetings = Array.isArray(result.body.meetings) ? result.body.meetings : [];

  console.log("\n[summary]");
  console.log(JSON.stringify({
    meeting_id: meetingId,
    count: meetings.length,
    meetings: meetings.map((meeting) => ({
      uuid: meeting.uuid,
      start_time: meeting.start_time
    }))
  }, null, 2));
} else {
  process.exitCode = 1;
}
