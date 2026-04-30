import type { TreeMenu } from "$lib";
import topMenuSource from "$lib/assets/data/menu.json";

type MenuTab = {
  key: string;
  label: string;
  path: string;
};

const topMenus = [...(topMenuSource as TreeMenu[])].filter(isTreeMenu).sort((a, b) => a.order - b.order);

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
    if (!key || key === "menu") {
      continue;
    }

    const menus = parseMenus(raw);
    if (menus.length > 0) {
      map.set(key, menus);
    }
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

function buildAdminMenus(url: URL): TreeMenu[] {
  const segments = url.pathname.split("/").filter(Boolean);
  const password = segments[1];

  if (!password) {
    return [];
  }

  const basePath = `/admin/${password}`;

  return [
    {
      id: "admin-overview",
      name: "Overview",
      path: basePath,
      order: 10,
    },
    {
      id: "admin-rankings",
      name: "Ranking Ops",
      path: `${basePath}/rankings`,
      order: 20,
    },
    {
      id: "admin-ip-bans",
      name: "IP Ban Ops",
      path: `${basePath}/ip-bans`,
      order: 30,
    },
  ];
}

export const load = async ({ url }: { url: URL }) => {
  const chromeHiddenPaths = new Set(["/info/fitness"]);
  const hideChrome = chromeHiddenPaths.has(url.pathname);
  const menuMap = buildMenuMap();
  const topMenuKeys = new Set(topMenus.map((menu) => menu.id.toLowerCase()));
  const pathFirstSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  const activeMenu =
    pathFirstSegment && (topMenuKeys.has(pathFirstSegment) || pathFirstSegment === "admin")
      ? pathFirstSegment
      : "home";
  const menus =
    activeMenu === "admin"
      ? buildAdminMenus(url)
      : activeMenu
        ? (menuMap.get(activeMenu) ?? [])
        : [];
  const menuTabs: MenuTab[] = topMenus.map((menu) => ({
    key: menu.id,
    label: menu.name || menuLabelFromKey(menu.id),
    path: menu.id === activeMenu ? url.pathname : menu.path || firstMenuPath(menuMap.get(menu.id) ?? [], menu.id),
  }));

  return {
    menus,
    menuTabs,
    activeMenu,
    hideChrome,
  };
};
