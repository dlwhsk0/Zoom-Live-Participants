# Docs Guide

이 프로젝트 문서는 이제 `main` 기준 단일 문서 체계로 관리한다.

핵심 원칙:

- 과정 로그를 무한 누적하지 않는다.
- 틀린 내용은 새 문서를 더 쌓는 대신 기존 문서를 수정해 최신 정답으로 맞춘다.
- v1 기록은 `snapshot/v1-esm` 브랜치에 보존되어 있으므로, `main`은 현재 기준 문서 품질에 집중한다.

현재 기준 문서:

- `docs/migration-baseline.md`
  - 마이그레이션 범위와 목표/비목표
- `docs/setup-vercel-supabase.md`
  - Vercel + Supabase 무료 플랜 기준 가입/연동/환경변수 설정 가이드
- `docs/participant-event-classification.md`
  - 실측 `leave_reason` 5종과 `room_scope` 분류 규칙 (v1 결함 포함)

운영 방식:

- 이 디렉토리 문서는 누적형 회고가 아니라 **현재 기준서**다.
- 방향이 바뀌면 새 파일을 계속 추가하기보다 기존 문서를 업데이트한다.
