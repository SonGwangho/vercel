import type { TreeMenu } from "$lib";
import menuRaw from "$lib/assets/data/menu.json?raw";

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

export const load = async () => {
  const menus = parseMenus(menuRaw);

  return { menus };
};
