# AGENTS.md 지침

* AGENTS.md 파일을 무조건 참조한다.
* 아래 버전에 따라 개발한다.
* 모든 파일 인코딩은 UTF-8 기준으로 작성한다.
* 구현한 Card, Component, Page 등에 요구사항 문구를 description으로 그대로 적지 않는다.
* 개발자가 아닌 실제 사이트 사용자 기준에 맞춰서 개발한다.

## 디자인
* DESIGN.md 파일을 참조한다.

## 버전 관리
- 기준 프로젝트: `toy-svelte-kit`
- 버전 기준
  - 명시 버전: `toy-svelte-kit/package.json` (`^` 포함)
  - 설치 버전: `toy-svelte-kit/package-lock.json` (실제 설치)
- 주요 스택 버전
  - `@sveltejs/kit`: `^2.50.1` (installed: `2.50.2`)
  - `svelte`: `^5.48.2` (installed: `5.49.2`)
  - `@sveltejs/vite-plugin-svelte`: `^6.2.4` (installed: `6.2.4`)
  - `@sveltejs/adapter-auto`: `^7.0.0` (installed: `7.0.0`)
  - `vite`: `^7.3.1` (installed: `7.3.1`)
  - `svelte-check`: `^4.3.5` (installed: `4.3.6`)
  - `typescript`: `^5.9.3` (installed: `5.9.3`)
  - `neon`: `2.21.2` (intalled: `2.21.2`)

## 경로 관리
**타입 경로**
- 타입은 `/src/lib/types`에 모두 정의한다.
- 정의한 타입은 `/src/lib/index.ts`에서 모두 `export *` 한다.

**PAGE 경로**
- 페이지는 `/src/{MENU_DIR}/{MENU_TITLE}` 경로에 폴더를 만들어서 작성한다.
- 페이지 타입은 `TreeMenu.ts` 파일에 정의된 `TreeMenu`를 따른다.
- 메뉴는 직접 생성하지 않고 `src\\lib\\assets\\data\\menu.json` 경로에 작성한다.


## 데이터 관리
- 데이터는 최대한 클라이언트에 저장한다.
- 단순 CRUD는 Neon Postgres를 사용한다.
- 그 외 꼭 필요한 경우에만 서버 데이터 및 API를 사용한다.

**정적 데이터**
- 정적 데이터들은 모두 `/src/lib/assets/data/{dataDir}` 경로에 저장한다.
- 카테고리에 따라 디렉토리를 만들고 값은 가능한 json으로 저장한다.

**로컬 데이터**
- 로컬에 데이터를 저장할 때는 localStorage가 아닌 `src/lib/utils/Storage.ts`의 IndexedDB를 사용한다.

**서버 데이터**
- 서버 API 호출은 `/api/{endpoint}` 규칙을 따른다.
- `/api/*` 는 SvelteKit 서버 라우트에서 직접 처리하고, 단순 CRUD 및 일반 조회는 Neon Postgres를 우선 사용한다.
- 외부 서버(`http://168.107.31.65:8080`)는 웹소켓, SSE, 스트리밍, 장시간 연결 등 양방향/실시간 통신이 필요한 경우에만 사용한다.
- 외부 서버가 필요한 경우 경로는 `/realtime/{endpoint}` 또는 해당 서버의 직접 주소를 사용하고, 일반 API를 `/api/*` rewrite로 우회하지 않는다.
- 서버 API는 필요시 *http://168.107.31.65:8080/swagger-ui/index.html* 의 스웨거를 참고한다.

**데이터베이스**
- 데이터베이스는 Neon Postgres를 사용한다.
- 서버에서 실시간 데이터 변경이 필요한게 아니면 Neon Postgres를 사용한다.
- vercel에 DATABASE_URL로 환경 변수가 등록되어 있다.
