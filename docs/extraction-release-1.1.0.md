# 1.1.0 ERP 추출 지침 변경안

Core MCP 0.3.0의 outcome/recovery 계약을 위한 text-only `skills/erp-extraction/SKILL.md`를 제공한다. 기존 portable/legacy manifest의 버전과 설명을 맞췄으며 서버 주소·MCP transport·설치/인증 정책·Read 권한·예시 프롬프트를 유지했다.

플러그인은 데이터 발견·추출·복구·표상에 집중하고, 파일 해석·분석·계산·결과 파일은 외부 ChatGPT/Codex가 수행하도록 구분한다. 미확인 VAT/분류를 추정하거나 실패를 0건으로 표현하지 않는다.

기존 validator에 정확히 한 SKILL.md 경로와 크기/이름/frontmatter 검증을 추가했다. 임의 디렉터리·symlink·hook·실행 파일·추가 endpoint·인증 정보 내장은 계속 거부한다. 패키지 보안 테스트 13개 통과.

출시 순서: Core 호환 배포/원천 readback → 이 패키지 main 반영 → 두 호스트에서 새 대화/discovery/실제 조회·복구 검증. 현재 로컬 소스 변경이며 출시 완료가 아니다. 설치 파일 cache를 직접 수정하거나 전체 OAuth 토큰을 reset하지 않는다.
