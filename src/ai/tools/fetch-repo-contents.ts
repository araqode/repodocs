"use server";

import { ai } from "@/ai/genkit";
import { z } from "zod";

export interface FileNode {
  type: 'file' | 'dir';
  name: string;
  path: string;
  content?: string;
  children?: FileNode[];
}

const FetchRepoContentsInputSchema = z.object({
  repoPath: z.string().describe('The path of the GitHub repository in owner/repo format.'),
});

const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    type: z.enum(['file', 'dir']),
    name: z.string(),
    path: z.string(),
    content: z.string().optional(),
    children: z.array(FileNodeSchema).optional(),
  })
);

const FetchRepoContentsOutputSchema = z.array(FileNodeSchema);


async function fetchFromApi(url: string) {
    const GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN;
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (GITHUB_API_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_API_TOKEN}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GitHub API request failed with status ${response.status}: ${errorBody}`);
    }
    return response.json();
}


async function getRepoTree(owner: string, repo: string, branch: string = 'main'): Promise<FileNode[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const { tree } = await fetchFromApi(url);

    const fileMap: { [path: string]: FileNode } = {};
    const rootNodes: FileNode[] = [];

    for (const item of tree) {
        const pathParts = item.path.split('/');
        let currentLevel = rootNodes;
        let currentPath = '';

        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            let node = fileMap[currentPath];

            if (!node) {
                const isDir = i < pathParts.length - 1 || item.type === 'tree';
                node = {
                    name: part,
                    path: currentPath,
                    type: isDir ? 'dir' : 'file',
                };

                if (isDir) {
                    node.children = [];
                } else {
                    if (item.type === 'blob' && item.url) {
                      try {
                        const contentResponse = await fetchFromApi(item.url);
                        if (contentResponse.encoding === 'base64') {
                          node.content = Buffer.from(contentResponse.content, 'base64').toString('utf-8');
                        }
                      } catch (e) {
                         console.warn(`Could not fetch content for ${item.path}: ${e}`);
                         node.content = 'Error fetching content.'
                      }
                    }
                }
                
                fileMap[currentPath] = node;

                if (i === 0) {
                    rootNodes.push(node);
                } else {
                    const parentPath = pathParts.slice(0, i).join('/');
                    const parentNode = fileMap[parentPath];
                    if (parentNode && parentNode.children) {
                        parentNode.children.push(node);
                    }
                }
            }

            if (node.type === 'dir' && node.children) {
                currentLevel = node.children;
            }
        }
    }
    return rootNodes;
}

export const fetchRepoContents = ai.defineTool(
  {
    name: "fetchRepoContents",
    description: "Fetches the file structure and content of a public GitHub repository.",
    inputSchema: FetchRepoContentsInputSchema,
    outputSchema: FetchRepoContentsOutputSchema,
  },
  async ({ repoPath }) => {
    const urlParts = repoPath.split('/');
    if (urlParts.length !== 2) {
      throw new Error('Invalid GitHub repository path. Please use the owner/repo format.');
    }
    const [owner, repo] = urlParts;
    
    // You might need to determine the default branch dynamically, but 'main' is a common default.
    try {
        return await getRepoTree(owner, repo, 'main');
    } catch (e) {
        // If 'main' branch fails, try 'master' as a fallback
        console.log("Failed to fetch 'main' branch, trying 'master'");
        return await getRepoTree(owner, repo, 'master');
    }
  }
);
