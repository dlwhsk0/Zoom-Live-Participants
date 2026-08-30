/**
 * Vercel Functions 진입점.
 *
 * Vercel 은 저장소 루트의 api/ 디렉토리를 엔드포인트로 인식한다.
 * 실제 구현은 워크스페이스 안에 두고 여기서는 연결만 한다.
 */
export { default } from "../apps/api/api/webhook.ts";
