
export interface FileNode {
  type: 'file' | 'dir';
  name: string;
  path: string;
  content?: string;
  children?: FileNode[];
  sha?: string;
}

    