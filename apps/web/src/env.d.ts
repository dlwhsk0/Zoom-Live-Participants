/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** API 오리진. 비우면 같은 도메인의 /api 를 쓴다. */
	readonly VITE_API_BASE?: string;
	/** 조회할 회의방 번호. 비우면 서버의 ZOOM_MEETING_ID 를 쓴다. */
	readonly VITE_MEETING_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
