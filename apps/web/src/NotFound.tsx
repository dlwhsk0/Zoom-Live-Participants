/**
 * 없는 주소.
 *
 * 오타를 쳐도 참가자 화면이 열리던 것을 막는다.
 *
 * HTTP 상태는 200 이다. 이 앱은 어느 주소로 와도 같은 index.html 을 받고
 * 화면에서 갈라진다. 서버가 진짜 404 를 주게 하려면 유효한 주소 목록을
 * 서버가 알아야 하는데, 그러면 어드민 주소만 200 이라 훑어보면 찾힌다.
 * 지금처럼 전부 200 이면 스캐너 쪽에서는 아무것도 구분되지 않는다.
 *
 * 그래서 여기서는 무엇이 있고 없는지 말하지 않는다.
 */
export default function NotFound() {
	return (
		<main className="screen">
			<div className="notfound">
				<p className="notfound__code">404</p>
				<p className="notfound__text">없는 주소입니다.</p>
				<a className="notfound__home" href="/">
					접속 현황 보기
				</a>
			</div>
		</main>
	);
}
