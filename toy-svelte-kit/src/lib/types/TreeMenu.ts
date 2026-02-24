export type TreeMenu = {
  id: string;
  name: string;
  path: string;
  parent?: string;
  description?: string;
  order: number;
};

export type TreeNode<T> = T & {
  children: TreeNode<T>[];
};
