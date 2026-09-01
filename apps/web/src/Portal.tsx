import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 팝업을 body 바로 아래에 그린다.
 *
 * 타일 안에 그리면 카드가 만든 stacking context 에 갇힌다.
 * `.card--offline` 의 opacity 가 그런 경우다 — 1 보다 작은 opacity 는
 * stacking context 를 만들고, 그 안에서는 z-index 가 아무리 커도
 * 바깥 형제들보다 위로 올라가지 못한다. 실제로 모바일에서 팝업이
 * 뒤 타일들에 가려 수정을 못 했다.
 *
 * 서버 렌더에는 document 가 없다. 테스트와 미리보기가 renderToString 을
 * 쓰므로 그때는 제자리에 그린다.
 */
export default function Portal({ children }: { children: ReactNode }) {
	if (typeof document === "undefined") return <>{children}</>;
	return createPortal(children, document.body);
}
