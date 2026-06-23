export type TreeMenu = {
  id: string;
  name: string;
  path: string;
  parent?: string;
  description?: string;
  defaultOpen?: boolean;
  order: number;
};

export type TreeNode<T> = T & {
  children: TreeNode<T>[];
};
