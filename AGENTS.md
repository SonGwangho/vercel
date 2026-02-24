## 경로 관리
**타입 경로**
- 타입은 /lib/types 에 모두 정의한다.
- 정의한 타입은 index.ts에서 모두 export * 한다.

**PAGE 경로**
- 페이지는 /src/{MENU_DIR}/{MENU_TITLE} 경로에 폴더를 만들어서 작성한다.
- 페이지 타입은 TreeMenu를 따른다.
- 모든 메뉴는 /src/data/menu.json에 정의한다.
