# pgAdmin 설정

`docker compose` 로 띄우는 로컬 개발용 pgAdmin 의 초기 설정이다.

- `servers.json` — DB 연결을 미리 등록한다. 컨테이너 네트워크 기준이라 호스트는 `postgres` 다.
- `pgpass` — 연결 비밀번호.

여기 있는 값은 **로컬 개발 전용**이다.
`docker-compose.yml` 에 그대로 적혀 있는 값과 같고, 외부에서 접근할 수 없다.
실제 운영 DB 자격증명은 이 디렉토리에 두지 않는다.
