# AGENTS.md 지침

* AGENTS.md 파일을 무조건 참조한다.
* 아래 버전에 따라 개발한다.

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

## 경로 관리
**타입 경로**
- 타입은 `/src/lib/types`에 모두 정의한다.
- 정의한 타입은 `/src/lib/index.ts`에서 모두 `export *` 한다.

**PAGE 경로**
- 페이지는 `/src/{MENU_DIR}/{MENU_TITLE}` 경로에 폴더를 만들어서 작성한다.
- 페이지 타입은 `TreeMenu.ts` 파일에 정의된 `TreeMenu`를 따른다.
- 메뉴는 직접 생성하지 않고 `src\\lib\\assets\\data\\*.json` 경로에 작성한다.
