import type { TreeMenu } from "$lib";

type MenuTab = {
  key: string;
  label: string;
  path: string;
};

const menuRawFiles = import.meta.glob("$lib/assets/data/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function isTreeMenu(value: unknown): value is TreeMenu {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TreeMenu>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.order === "number" &&
    (candidate.parent === undefined || typeof candidate.parent === "string") &&
    (candidate.description === undefined ||
      typeof candidate.description === "string")
  );
}

function parseMenus(raw: string): TreeMenu[] {
  const normalized = raw.replace(/^\uFEFF/, "").trim();

  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isTreeMenu);
  } catch {
    return [];
  }
}

function menuKeyFromPath(path: string): string | null {
  const fileName = path.split("/").pop();
  if (!fileName) {
    return null;
  }

  return fileName.replace(/\.json$/i, "").trim().toLowerCase() || null;
}

function menuLabelFromKey(key: string): string {
  if (!key) {
    return "";
  }

  return key.charAt(0).toUpperCase() + key.slice(1);
}

function buildMenuMap(): Map<string, TreeMenu[]> {
  const map = new Map<string, TreeMenu[]>();

  for (const [path, raw] of Object.entries(menuRawFiles)) {
    const key = menuKeyFromPath(path);
    if (!key) {
      continue;
    }

    map.set(key, parseMenus(raw));
  }

  return map;
}

function firstMenuPath(menus: TreeMenu[], key: string): string {
  if (!menus.length) {
    return `/${key}`;
  }

  const roots = menus
    .filter((menu) => !menu.parent)
    .sort((a, b) => a.order - b.order);

  if (roots[0]?.path) {
    return roots[0].path;
  }

  const all = [...menus].sort((a, b) => a.order - b.order);
  return all[0]?.path || `/${key}`;
}

export const load = async ({ url }: { url: URL }) => {
  const menuMap = buildMenuMap();
  const keys = [...menuMap.keys()].sort((a, b) => a.localeCompare(b));
  const pathFirstSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  const activeMenu =
    pathFirstSegment && menuMap.has(pathFirstSegment) ? pathFirstSegment : "home";
  const menus = activeMenu ? (menuMap.get(activeMenu) ?? []) : [];
  const menuTabs: MenuTab[] = [
    {
      key: "home",
      label: "Home",
      path: "/",
    },
    ...keys.map((key) => ({
      key,
      label: menuLabelFromKey(key),
      path: firstMenuPath(menuMap.get(key) ?? [], key),
    })),
  ];

  return {
    menus,
    menuTabs,
    activeMenu,
  };
};
