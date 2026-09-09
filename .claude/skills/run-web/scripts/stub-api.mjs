// 로컬 확인용 API 스텁. /api/participants 만 채워 준다.
import { createServer } from "node:http";

const NAMES = [
  "김하나","이도윤","박서준","최지우","정민수","강예린","조현우","윤소희",
  "임재현","한가람","오세훈","신유진","배준호","송하늘","권도현","황미래",
  "서지훈","문채원","남기훈","백은지","고태윤","유아름","전민재","심규리",
];

// tier2(1~3h) 를 많이 깔아 둔다. 불꽃(z-index: 2)이 문제의 주인공이다.
const SECONDS = [
  5400, 7200, 4000, 3600, 21600, 19000, 12000, 11000,
  1800, 900, 100, 5000, 6800, 3700, 4200, 8000,
];

const now = Date.now();
const participants = NAMES.map((displayName, i) => {
  const isPresent = i < SECONDS.length;
  return {
    participantUuid: `uuid-${i}`,
    displayName,
    firstJoinedAt: new Date(now - 6 * 3600e3).toISOString(),
    isPresent,
    lastOccurredAt: new Date(now - (isPresent ? 5e3 : (i - 15) * 3600e3)).toISOString(),
    connectionCount: 1,
    onlineSeconds: isPresent ? SECONDS[i] : 3600,
    statusMessage: i % 3 === 0 ? "알고리즘 문제 푸는 중" : null,
    joinTimeUncertain: false,
    isYou: i === 2,
  };
});

const snapshot = {
  meetingId: "1234567890",
  meetingUuid: "abc==",
  count: participants.filter((p) => p.isPresent).length,
  totalCount: participants.length,
  startedAt: new Date(now - 6 * 3600e3).toISOString(),
  startedAtEstimated: false,
  openedBy: "김하나",
  updatedAt: new Date(now).toISOString(),
  participants,
};

createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url?.startsWith("/api/participants")) return res.end(JSON.stringify(snapshot));
  res.statusCode = 404;
  res.end(JSON.stringify({ message: "stub: not found" }));
}).listen(3000, () => console.log("stub api on :3000"));
