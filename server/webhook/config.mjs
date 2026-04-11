import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");

function loadDotEnv() {
	if (!existsSync(ENV_PATH)) {
		return;
	}

	const contents = readFileSync(ENV_PATH, "utf8");

	for (const rawLine of contents.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();

		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

loadDotEnv();

export const appConfig = {
	port: Number(process.env.PORT ?? "3000"),
	secretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? "",
	webhookLogPath: resolve(
		process.cwd(),
		process.env.WEBHOOK_LOG_PATH ?? "logs/webhook-events.ndjson",
	),
	slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
	slackBotToken: process.env.SLACK_BOT_TOKEN ?? "",
	slackAdminApiKey: process.env.SLACK_ADMIN_API_KEY ?? "",
	slackNotifyMeetingId: process.env.SLACK_NOTIFY_MEETING_ID ?? "",
	slackNotifyEvents: new Set(
		String(process.env.SLACK_NOTIFY_EVENTS ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	),
};

export const slackJoinTemplates = [
	":tada: {name} 용사님 드디어 돌아오셨군요! :crossed_swords: :sparkles:",
	":raised_hands: {name} 님께서 입장하십니다~! :tada: :fire:",
	":boom: {name} 님 등장! 이제 분위기 좀 나겠네요. :fire: :eyes:",
	":rocket: {name} 님 입장 완료. 슬슬 시작해도 되겠습니다. :eyes: :zap:",
	":sparkles: {name} 님 어서 오세요. 오늘도 한 건 해봅시다. :rocket: :muscle:",
	":crown: {name} 님 입장. 오셨군요, 이제 판이 커집니다. :sparkles: :tada:",
	":chefkiss: {name} 님 합류! 이 조합, 제법 맛도리인데요? :fire: :raised_hands:",
	":muscle: {name} 님 들어오셨습니다. 이건 좀 든든한데요. :sparkles: :ok_hand:",
	":boom: {name} 님 등장. 오늘 회의 폼 미쳤다. :fire: :star2:",
	":four_leaf_clover: {name} 님 입장하셨습니다. 이 타이밍, 꽤나 럭키비키잖아. :sparkles: :tada:",
	":raised_hands: {name} 님 합류 완료. 이제 좀 사람 사는 회의 같네요. :sparkles: :house_with_garden:",
	":zap: {name} 님 들어오셨습니다. 시작부터 텐션 좋고. :fire: :microphone:",
	":crown: {name} 님 등장! 다들 집중, 메인 캐릭터 입장하셨습니다. :sparkles: :eyes:",
	":star2: {name} 님 입장. 오늘의 킥, 벌써부터 기대됩니다. :rocket: :tada:",
	":gear: {name} 님 접속 완료. 이 회의 이제 진짜 굴러갑니다. :sparkles: :muscle:",
	":relieved: {name} 님 오셨습니다. 일단 마음이 놓이네요. :sparkles: :raised_hands:",
	":clap: {name} 님 등장. 오늘도 레전드 갱신 각 보입니다. :fire: :trophy:",
	":ok_hand: {name} 님 입장. 이 멤버면 된다, 됩니다. :sparkles: :rocket:",
	":microphone: {name} 님 들어오셨네요. 분위기 바로 살아납니다. :fire: :notes:",
	":chart_with_upwards_trend: {name} 님 합류! 오자마자 신뢰도 +37 상승했습니다. :sparkles: :clap:",
];

export const slackLeftTemplates = [
	":eyes: {name} 님 벌써 가세요? :melting_face: :wave:",
	":dash: {name}님 할 일 다 하셨답니다 벌써 들어가신답니다~~ :see_no_evil: :sparkles:",
	":wave: {name} 님 퇴장! 다음 출근 도장도 기대하겠습니다. :calendar: :saluting_face:",
	":thinking_face: {name} 님이 자리를 비웠습니다. 금방 돌아오시려나요? :hourglass_flowing_sand: :eyes:",
	":saluting_face: {name} 님 퇴장 완료. 남은 분들 집중 유지 바랍니다. :muscle: :fire:",
	":cloud: {name} 님 퇴장하셨습니다. 여운이 제법 남는데요. :sparkles: :pensive:",
	":broken_heart: {name} 님 이탈. 방금까지 좋았던 공기, 살짝 아쉽네요. :cloud: :eyes:",
	":leaves: {name} 님 퇴장 완료. 이 또한 흐름이겠죠. :wind_blowing_face: :sparkles:",
	":mute: {name} 님 나가셨습니다. 회의장에 적막이 한 스푼 추가됐습니다. :coffee: :eyes:",
	":pensive: {name} 님 퇴장. 아... 이건 좀 아쉽다. :broken_heart: :dash:",
	":battery: {name} 님 자리 비움. 돌아오시면 다시 텐션 올리겠습니다. :zap: :wave:",
	":man-shrugging: {name} 님 퇴장하셨습니다. 보내드려야죠, 어쩌겠습니까. :coffee: :leaves:",
	":face_with_monocle: {name} 님 나가셨네요. 남은 인원, 정신 바짝 차리시죠. :warning: :muscle:",
	":chart_with_downwards_trend: {name} 님 퇴장. 도파민 살짝 감소했습니다. :melting_face: :chart_with_downwards_trend:",
	":warning: {name} 님 이탈 확인. 회의 난이도 소폭 상승. :fire: :eyes:",
	":muscle: {name} 님 퇴장 완료. 그래도 우린 해냅니다. :shield: :sparkles:",
	":hourglass_flowing_sand: {name} 님 로그아웃급 퇴장. 다음 등장을 기다리겠습니다. :wave: :stars:",
	":melting_face: {name} 님 나가셨습니다. 방금까지 있었던 안정감이 사라졌습니다. :broken_heart: :coffee:",
	":briefcase: {name} 님 퇴장. 그저 갓생을 사러 떠나신 걸로. :sunglasses: :sparkles:",
	":sob: {name} 님 이탈! 이 장면, 살짝 눈물 버튼이네요. :cry: :sparkling_heart:",
	":mega: {name} 님 퇴장하셨습니다. 다음 입장 때 더 크게 환영하겠습니다. :tada: :wave:",
	":cry: {name} 님 퇴장. 현장 체감상 아쉬움 200%입니다. :melting_face: :broken_heart:",
	":coffee: {name} 님 나가셨습니다. 회의방이 갑자기 현실 모드네요. :mute: :eyes:",
	":shield: {name} 님 퇴장 완료. 남은 분들끼리 잘 버텨보겠습니다. :muscle: :fire:",
	":sparkling_heart: {name} 님 이탈. 짧지만 강렬했습니다. :sparkles: :wave:",
];
