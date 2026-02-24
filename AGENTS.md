# AGENTS.md 지침

1. AGENTS.md 파일을 무조건 참조한다.

## 경로 관리
**타입 경로**
- 타입은 `/src/lib/types`에 모두 정의한다.
- 정의한 타입은 `/src/lib/index.ts`에서 모두 `export *` 한다.

**PAGE 경로**
- 페이지는 `/src/{MENU_DIR}/{MENU_TITLE}` 경로에 폴더를 만들어서 작성한다.
- 페이지 타입은 `TreeMenu.ts` 파일에 정의된 `TreeMenu`를 따른다.
- 메뉴는 직접 생성하지 않고 `src\\lib\\assets\\data\\menu.json` 경로에 작성한다.
