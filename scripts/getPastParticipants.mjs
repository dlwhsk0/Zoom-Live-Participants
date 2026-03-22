import { zoomGet, printResult } from "./lib/zoom.mjs";

const meetingUuid = process.argv[2];

if (!meetingUuid) {
  console.error("Meeting UUID is required. Usage: node scripts/getPastParticipants.mjs <meetingUuid>");
  process.exit(1);
}

const encodedUuid = encodeURIComponent(encodeURIComponent(meetingUuid));
const result = await zoomGet(`/past_meetings/${encodedUuid}/participants`, {
  page_size: 300
});

printResult("past participants", result);

if (result.ok) {
  const participants = Array.isArray(result.body.participants) ? result.body.participants : [];

  console.log("\n[summary]");
  console.log(JSON.stringify({
    total_records: result.body.total_records,
    count: participants.length,
    participants: participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      user_email: participant.user_email
    }))
  }, null, 2));
} else {
  process.exitCode = 1;
}
