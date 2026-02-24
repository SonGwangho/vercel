import type { TreeMenu } from "$lib";

type MenuDay = {
  MENU_TITLE: `${number}일`;
  path: string;
};

type MenuDirectory = {
  MENU_DIR: `${number}년 ${number}월`;
  days: MenuDay[];
};

const MENU_STRUCTURE: MenuDirectory[] = [
  {
    MENU_DIR: "2026년 02월",
    days: [
      { MENU_TITLE: "24일", path: "/wiki/2026-02-24" },
      { MENU_TITLE: "25일", path: "/wiki/2026-02-25" },
    ],
  },
  {
    MENU_DIR: "2026년 03월",
    days: [
      { MENU_TITLE: "01일", path: "/wiki/2026-03-01" },
      { MENU_TITLE: "02일", path: "/wiki/2026-03-02" },
    ],
  },
];

function createMenus(structure: MenuDirectory[]): TreeMenu[] {
  return structure.flatMap((directory, dirIndex) => {
    const parentId = `DIR-${dirIndex + 1}`;

    const parentMenu: TreeMenu = {
      id: parentId,
      name: directory.MENU_DIR,
      path: directory.days[0]?.path ?? "/wiki",
      order: (dirIndex + 1) * 10,
    };

    const children = directory.days.map((day, dayIndex) => ({
      id: `${parentId}-DAY-${dayIndex + 1}`,
      name: day.MENU_TITLE,
      path: day.path,
      order: (dayIndex + 1) * 10,
      parent: parentId,
    }));

    return [parentMenu, ...children];
  });
}

export const load = async () => {
  const menus: TreeMenu[] = createMenus(MENU_STRUCTURE);

  return { menus };
};
