import type { TreeNode } from "$lib/types/TreeMenu";

// 트리 생성 함수
export function buildTree<
  T extends { id: string; parent?: string; order: number },
>(items: T[]): TreeNode<T>[] {
  const map = new Map<string, TreeNode<T>>();
  const roots: TreeNode<T>[] = [];

  // 노드 생성
  items.forEach((item) => {
    map.set(item.id, { ...item, children: [] });
  });

  // 부모 연결
  items.forEach((item) => {
    const node = map.get(item.id)!;

    if (!item.parent) {
      roots.push(node);
    } else {
      const parent = map.get(item.parent);
      parent?.children.push(node);
    }
  });

  // 정렬 (재귀)
  const sortRecursive = (nodes: TreeNode<T>[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => sortRecursive(n.children));
  };

  sortRecursive(roots);

  return roots;
}
