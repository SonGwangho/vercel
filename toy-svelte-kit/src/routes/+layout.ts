import type { TreeMenu } from "$lib";

export const load = async () => {
  const menus: TreeMenu[] = [
    {
      id: "P0001",
      name: "1. 메뉴 최상단",
      path: "/menu/",
      order: 10,
    },
    {
      id: "C0011",
      name: "1. 메뉴 최상단의 자식1",
      path: "/menu/child11",
      order: 10,
      parent: "P0001",
    },
    {
      id: "C0012",
      name: "1. 메뉴 최상단의 자식2",
      path: "/menu/child12",
      order: 20,
      parent: "P0001",
    },
    {
      id: "P0002",
      name: "2. 메뉴 최상단",
      path: "/menu",
      order: 10,
    },
    {
      id: "C0021",
      name: "2. 메뉴 최상단의 자식",
      path: "/menu/child21",
      order: 10,
      parent: "P0002",
    },
    {
      id: "C0022",
      name: "2. 메뉴 최상단의 자식",
      path: "/menu/child22",
      order: 20,
      parent: "P0002",
    },
  ];

  return { menus };
};
