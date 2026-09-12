/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** API 오리진. 비우면 같은 도메인의 /api 를 쓴다. */
	readonly VITE_API_BASE?: string;
	/** 조회할 회의방 번호. 비우면 서버의 ZOOM_MEETING_ID 를 쓴다. */
	readonly VITE_MEETING_ID?: string;
	/** 어드민 화면 주소. 비우면 /admin. 상세는 main.tsx 주석 참고. */
	readonly VITE_ADMIN_PATH?: string;
	/**
	 * 참가자 목록에서 걸러낼 봇 이름. 쉼표로 여럿.
	 * 서버의 BOT_NAMES 와 같은 값. 상세는 api.ts 주석 참고.
	 */
	readonly VITE_BOT_NAMES?: string;
	/** 조회 API 공유 토큰. 서버의 ACCESS_TOKEN 과 같은 값. 비우면 안 보낸다. */
	readonly VITE_ACCESS_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
