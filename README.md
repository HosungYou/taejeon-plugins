# 태전 업무비서 플러그인

태전그룹 사용자가 앱에서 설치할 수 있는 공개 플러그인 마켓플레이스입니다. 이 저장소는 **설치 설정과 안내만** 제공합니다. Core 애플리케이션 소스, 직원·거래처 데이터, 인증 토큰은 포함하지 않습니다.

## 앱에서 설치하기

이 안내는 **Plugins → Add → Add marketplace** 메뉴가 있는 Codex / ChatGPT 데스크톱의 Work·Codex 환경을 대상으로 합니다. 일반 웹 ChatGPT의 사용자 지정 MCP 등록과는 다른 경로입니다.

1. 앱에서 **Plugins → Add → Add marketplace**를 엽니다.
2. **Source**에 아래 저장소 주소를 붙여 넣습니다.

   ```text
   https://github.com/HosungYou/taejeon-plugins
   ```

3. **Git ref**를 입력해야 하면 `main`을 사용하고, **Sparse paths**는 비워 둡니다. **Add marketplace**를 누릅니다.
4. 추가한 **태전 Core** 마켓플레이스에서 **태전 업무비서**를 찾아 설치합니다. 바로 보이지 않으면 플러그인 목록을 새로고침하거나 앱을 다시 열어 확인합니다.
5. 연결 또는 인증 요청이 나타나면 **본인의 태전 회사 계정**으로 로그인합니다. Microsoft 추가 인증은 본인이 완료합니다.
6. 새 대화에서 태전 업무비서를 선택해 “Live API와 DB 기반 자료를 구분하고 조회시각·원천 갱신시각을 알려줘”라고 질문합니다.

이 설치 경로에는 CLI 명령, 개발자 모드 설정, 직원의 GitHub 계정이 필요하지 않습니다. 인증을 완료해도 실제 도구 조회가 성공하는지까지 확인하세요. 앱 버전에 따라 메뉴명과 인증 시점은 다를 수 있습니다.

> Source에는 **GitHub 저장소 주소**를 넣습니다. 아래 MCP 서버 주소를 Add marketplace에 넣으면 `repository not found` 오류가 납니다.

## 연결되는 서버

```text
https://taejeon-core-llm-mvp.vercel.app/api/mcp
```

플러그인은 원격 HTTP MCP를 사용합니다. 서버의 OAuth 검색 정보에 따라 직원별 로그인을 진행하며 공용 토큰이나 비밀번호를 배포하지 않습니다. 공개 플러그인을 설치하는 것만으로 회사 데이터에 접근할 수는 없습니다. Core 서버가 계정 자격과 각 조회의 권한을 검사합니다.

## 제공 범위

- 계정에 허용된 회사 업무 데이터 조회
- 지원 도구를 통한 거래처·약국 기본정보 조회
- 계정별로 활성화된 Live ERP 조회 도구

Live 도구는 모든 계정에 자동 제공되는 것이 아닙니다. 결과의 출처·조회시각·원천 기준시각·부분 결과 여부를 확인해야 합니다. API 장애 시 DB 대체 자료를 반환할 수 있으며 이를 최신값으로 해석하면 안 됩니다. 지도 링크·주변 약국·방문 경로 기능은 이 배포에 포함하지 않습니다.

## 연결이 안 될 때

- `repository not found`: Source에 위 GitHub 저장소 주소를 입력했는지 확인합니다.
- 플러그인이 안 보임: 마켓플레이스 추가 결과와 선택된 기기를 확인하고 목록을 새로고침합니다.
- 로그인 반복·권한 오류: Core 연결 허브에서 본인 계정 상태를 확인합니다. 비밀번호·토큰·인증 코드를 다른 사람에게 보내지 마세요.
- Live 도구가 없음: 해당 계정의 활성화 상태를 Core 관리자에게 확인합니다.
- 목록에 보이지만 조회 실패: 연결·인증·도구 조회는 별도 단계입니다. 오류 문구와 발생 시각을 관리자에게 알려주세요.

[Core 연결 안내](https://taejeon-core-llm-mvp.vercel.app/me/mcp) · [OpenAI 플러그인 문서](https://developers.openai.com/plugins/build/plugins)

## 배포 파일

- `.agents/plugins/marketplace.json`: 앱이 읽는 마켓플레이스 목록
- `plugins/taejeon-core/plugin.json`, `mcp.json`: Agent Plugins 1.0 형식
- `plugins/taejeon-core/.codex-plugin/plugin.json`, `.mcp.json`: 기존 Codex 클라이언트를 위한 호환 형식

두 형식은 같은 이름·버전·서버를 가리킵니다. 설치 시점의 앱 지원 범위에 따라 사용되며 중복 서버를 따로 등록할 필요는 없습니다.
