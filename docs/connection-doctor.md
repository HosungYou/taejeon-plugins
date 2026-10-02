# Codex 연결 진단: Mac·Windows

플러그인 설치, 서버 OAuth 세션, 현재 실행기의 인증, MCP 초기 연결,
도구 목록, 실제 ERP 조회를 각각 확인한다. 서버에 활성 세션이 있다는
이유만으로 현재 클라이언트가 연결됐다고 판단하지 않는다.

## 실행

Node.js 20 이상과 설치된 Codex 실행기가 필요하다. 새 의존성은 없다.
저장소 루트에서 Mac·Windows·Linux 모두 같은 명령을 사용한다.

```sh
node plugins/taejeon-core/scripts/connection-doctor.mjs
```

우선순위는 `--codex`로 지정한 실행기, 현재 호스트의 `CODEX_CLI_PATH`,
Mac의 앱 내장 실행기, PATH의 Codex 실행기 순이다. Windows에서는 실제
`codex.exe`를 사용한다. npm `.cmd`/`.bat` 래퍼를 셸로 실행하지 않는다.
경로에 공백이 있으면 따옴표로 감싼다. 앱 내장 경로를 알 수 없는 Windows
환경에서는 현재 앱이 제공한 `CODEX_CLI_PATH` 또는 설치된 exe 경로를 지정한다.

```sh
node plugins/taejeon-core/scripts/connection-doctor.mjs --codex "실제 Codex 실행기 경로"
```

이 실행기는 캐시·권한·토큰을 변경하지 않으며 사용자 동의 요청을
자동 승인하지 않는다. 인증 원문, 토큰, 도구 메타데이터, 원시 명세를
진단 결과에 출력하지 않는다. 정상 클라이언트가 기존 인증을 이용한다.
진단은 별도 새 프로세스의 로컬 연결을 시험한다. 이미 열린 앱/클라우드
채팅의 실행 환경이 같다고 가정하지 않는다.

## 결과 해석

| stage | 의미 |
|---|---|
| executable_unavailable | 실제 실행기를 찾거나 실행하지 못함 |
| configuration_or_cli_failure | 설정/CLI를 읽지 못함. CLI와 앱 버전을 비교 |
| plugin_unavailable | 현재 실행기의 플러그인이 미설치 또는 비활성 |
| authentication | 현재 클라이언트의 인증 또는 initialize 인증 거부 |
| authentication_unconfirmed | 인증 상태를 확인하지 못함 |
| discovery | 연결/도구 목록 조회 실패 |
| connection_unconfirmed | 캐시된 도구는 있으나 현재 연결 성공을 확인하지 못함 |
| connection_not_ready | 연결이 아직 시작되지 않았거나 진행 중 |
| sales_tool_missing | 확인된 인증과 목록에 매출 도구가 없음 |
| ready | 이 프로세스에서 매출 도구 호출 가능. 아직 실제 조회 성공은 아님 |
| thread_binding_failed | 지정한 기존 로컬 채팅을 연결하지 못함 |
| sales_call_failed | 매출 도구 호출/클라이언트 요청 실패 |

`authentication`은 ERP 매출 0건이나 데이터 접근권한 부족을 의미하지 않는다.
사용자가 인증을 완료했다면 같은 장치·호스트·실행기·회사 계정과 서버를
확인한다. 다른 계정으로 우회하거나 인증정보를 파일/채팅에 복사하지 않는다.
재설치·전체 토큰 초기화는 기본 복구 방법이 아니다.

## 실제 매출 호출

정상 인증과 도구 목록을 확인한 경우에만 호출한다. 현재 클라이언트에서
접근할 수 있는 기존 로컬 채팅 ID와 ERP에서 확인한 거래처 코드가 필요하다.
클라우드 채팅 ID를 로컬 채팅 ID로 추정하지 않는다. 새 채팅이나 모델 턴을
생성하지 않고 지정한 기존 채팅을 로컬 실행기에 resume한다.

`query.json`은 아래와 같이 작성한다. 예시 코드는 실제 업무 코드가 아니다.
실제 확인한 코드로 교체하고 선행 0을 보존한다. 회사 범위 근거가 없으면
`companies`를 생략한다. 서버의 기존 읽기 권한을 그대로 적용한다.

```json
{"custno":["확인한 영숫자 1~5자리 거래처 코드"],"from":"2026-09-01","to":"2026-09-30","detail":"lines"}
```

```sh
node plugins/taejeon-core/scripts/connection-doctor.mjs --thread EXISTING_LOCAL_CHAT_ID --sales-args query.json
```

명세·고객명 대신 출처, 수집 완료 여부, 행수, 확인된 금액 및 누락 구간
수를 반환한다. 실패는 `sales_failed`, 부분 수집은 `sales_partial`, 복구
조각은 `sales_fragment`다. 정상 빈 결과는 `sales_empty_verified`이며 다른
법인이나 전체 업무의 매출 0건으로 일반화하지 않는다. 자동 분류·VAT 가산·
누락 구간 복구·원본 엑셀 생성은 이 진단 실행기의 범위 밖이다.

## 캐시 갱신

출처가 오래된 경우 먼저 `codex plugin marketplace upgrade taejeon`을
실행하고 실제 설치 버전을 확인한다. 같은 구버전 출처에서 재설치하는
것은 갱신이 아니다. 갱신과 인증 복구는 별개이며 실제 읽기 호출로
복구 여부를 확인한다.

Mac에서 실제 OAuth 초기 연결 시험을 수행했다. Windows 실행기 선택과
프로토콜 처리는 자동 검증하지만 Windows 실계정·보안 저장소·브라우저
콜백 검증은 해당 장치에서 별도로 수행해야 한다.

## 호스트별 인증과 출시 증거

- ChatGPT Work·관리형 클라우드에서는 해당 호스트의 연결/OAuth 화면에서 로그인한다. 이 로컬 실행기를 cloud adapter로 사용하거나 cloud chat ID를 resume하지 않는다.
- Codex 데스크톱에서는 앱의 태전 연결에서 로그인하고 새 채팅에서 도구를 호출한다. 독립 진단 프로세스의 결과는 앱 자체의 성공/실패를 입증하지 않는다.
- CLI는 해당 프로필의 `codex mcp login taejeon-core` 경로를 사용한다. SSH는 원격 callback의 loopback 경로가 로컬 브라우저와 다름을 확인한다. WSL은 별도 Linux 호스트에서 인증한다. 다른 기기의 인증 파일을 복사하지 않는다.
- 정상 직원 사용에는 Node·이 진단기 실행이 필수가 아니다. MCP OAuth와 ChatGPT/Codex 계정 로그인은 별개다.

CI는 고정된 공식 Codex 0.159.2 native 실행기를 Windows/Mac/Linux runner에 설치해 모의 OAuth 서버와 PKCE 교환, 격리된 file 저장소, cold-start, 도구 목록, 실제 모의 읽기 호출을 검사한다. 운영 토큰을 사용하지 않는다. 이 결과는 OS 기본 keyring, 회사 SSO 정책, 실제 ERP 업무 완료, 관리형 cloud broker의 증거로 확대하지 않는다.
Core 0.4.0의 `/api/me/mcp/connection-status`는 본인 계정의 서버 관측 기록이다. `account_history`이며 현재 PC의 인증 저장·업무 완료를 보증하지 않는다. 로그인 세션별 격리는 신규 OAuth 로그인부터 적용되고 모호한 기존 세션은 기존 폐기 경계를 유지한다.

1.1.2는 상세 runtime 목록을 사용하고, 인증은 있으나 초기 목록이 비어 있으면 최대 3회만 초기화를 확인한다. Auth required나 명시적 discovery 실패는 반복하지 않는다. runtime 미확인 상태는 cached 목록이 있어도 ready가 아니다. 명시적으로 지정한 검증된 조회가 실제 성공해야 해당 독립 프로세스의 읽기 확인으로 승격한다. Work/cloud 채팅 ID가 로컬 thread가 아니면 로컬 resume로 대신 검증하지 않는다.
