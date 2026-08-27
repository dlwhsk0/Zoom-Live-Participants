# Vercel + Supabase Setup Guide (Free Tier)

이 문서는 v2 기준으로 배포 준비를 위한 가입/연동 과정을 정리한다.

대상:

- `Vercel` (Hobby)
- `Supabase` (Free)
- 프로젝트 저장소: GitHub

## 목표

- 비용은 무료 플랜으로 시작
- 로컬 개발과 배포 환경에서 같은 키 체계를 사용
- webhook/API 서버는 Vercel 함수 스타일, 데이터 저장은 Supabase Postgres

## 1. 계정 준비

1. GitHub 계정 준비
2. Vercel 가입 (GitHub 로그인)
3. Supabase 가입 (GitHub 로그인)

## 2. Supabase 프로젝트 생성

1. Supabase Dashboard에서 Organization 선택/생성
2. `Create new project`
3. 설정 입력
- Project name: 예) `zoom-live-participants`
- Database password: 강한 비밀번호 생성 후 안전하게 보관
- Region: 사용자와 가까운 리전 선택 (한국이면 Seoul 권장)
4. Security 옵션
- `Enable Data API`: 체크
- `Enable automatic RLS`: 초기에는 체크하지 않음

## 3. RLS 옵션 판단 기준

`Enable automatic RLS`는 public schema 신규 테이블에 RLS를 자동으로 켠다.

현재 프로젝트 기준 권장:

- 초기 개발 단계: 자동 RLS 미사용
- 이유: policy 준비 전에는 기본 접근이 막혀 디버깅이 복잡해질 수 있음
- 추후 프론트에서 anon key 직접 접근이 필요해지면 테이블별로 RLS + policy를 설계해서 켠다

## 4. 리전 잘못 선택했을 때

Supabase 프로젝트 생성 후 region 변경은 지원되지 않는다.

대응:

1. 올바른 region으로 새 프로젝트 생성
2. 새 프로젝트의 키/연결 문자열로 환경변수 교체
3. 마이그레이션 다시 적용
4. 기존(잘못 생성된) 프로젝트 삭제

데이터가 거의 없는 초기에는 이 방식이 가장 빠르고 안전하다.

## 5. Supabase에서 확보할 값

Supabase 프로젝트 생성 후 아래 값을 확인한다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용, 클라이언트 노출 금지)
- `DATABASE_URL` (Postgres 연결 문자열)

참고:

- 서버리스 환경에서는 pooled connection string 사용을 우선 검토한다.

## 6. Vercel 프로젝트 연결

1. Vercel Dashboard → `Add New Project`
2. GitHub repo import
3. 배포 프로젝트 생성
4. `Project Settings > Environment Variables`에 환경변수 등록

권장 환경변수 키:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (프론트 필요 시)
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용)
- `ZOOM_WEBHOOK_SECRET_TOKEN`
- `ZOOM_ACCOUNT_ID`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_MEETING_ID`
- `SLACK_BOT_TOKEN`
- `SLACK_DEFAULT_CHANNEL_ID`
- `SLACK_ADMIN_API_KEY`

## 7. 보안 원칙

- `SERVICE_ROLE`, `SLACK_BOT_TOKEN`, Zoom secret은 서버에서만 사용
- 브라우저에 노출 가능한 값은 `ANON_KEY`만
- Vercel env는 `Development / Preview / Production` 환경별로 관리

## 8. 무료 플랜 운영 체크포인트

- Vercel: Hobby 유지
- Supabase: Free 한도 내 운영
- 불필요한 대량 로그 저장 지양
- webhook burst 대비 멱등성(`dedupe_key`) 적용

## 9. 다음 실행 순서

1. Supabase 프로젝트 생성 및 키 확보
2. Vercel 프로젝트 import 및 env 등록
3. `apps/api` DB 마이그레이션 적용
4. webhook 엔드포인트를 배포 URL로 교체
