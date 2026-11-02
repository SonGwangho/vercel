# 장난감 웹 디자인 적용

## 적용한 스킬

- [Taste Skill](https://github.com/Leonxlnx/taste-skill): `.agents/skills/design-taste-frontend`
- [Impeccable](https://github.com/pbakaus/impeccable): `.agents/skills/impeccable`

두 스킬은 프로젝트에 설치했다. 새 Codex 턴부터 프로젝트 스킬로 사용할 수 있다.

## 이번 화면의 방향

- 모드: 대시보드와 도구를 위한 Operate. 위키 본문은 Read 기준을 유지한다.
- Taste Skill 방향: Editorial greeting, seed `1335212723`.
- 기존 `DESIGN.md`의 블루 포인트, 한글 폰트, 상단 탭, 트리 메뉴, 라이트/다크 테마를 유지한다.
- 홈의 질문: 현재 날씨와 게임 기록은 어떻고, 어떤 게임을 바로 시작할 수 있는가?
- 사이트 고유 요소: 장난감 모양에서 가져온 작은 브랜드 마크, 실제 날씨·대기질, 게임별 랭킹과 플레이 링크.
- 홈은 1100px, 12열, 16px 간격을 기준으로 날씨와 대기질을 5:7로 배치한다. 좁은 화면에서는 순서대로 쌓는다.
- 대기질은 측정값·단위·상태로 표시한다. 등급을 임의의 백분율로 바꾼 원형 그래프는 제거한다.
- 카드 그림자와 장식은 줄이고 표면색, 간격, 제목 위계, 정렬된 숫자로 구분한다.
- API와 게임 경로, 랭킹 데이터는 기존 프로젝트 데이터를 사용한다.

사용자 요청에 따라 수정 후 자동 검사·빌드·브라우저 검증은 실행하지 않는다.
