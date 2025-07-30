"use server";

import { ai } from "@/ai/genkit";
import { z } from "zod";
import { gemini20Flash, gemini15Flash, gemini15Pro } from '@genkit-ai/googleai';
import { listModels } from 'genkit';


export interface FileNode {
  type: 'file' | 'dir';
  name: string;
  path: string;
  content?: string;
  children?: FileNode[];
  sha?: string;
}

const FetchRepoContentsInputSchema = z.object({
  repoPath: z.string().describe('The path of the GitHub repository in owner/repo format.'),
  path: z.string().optional().describe('The path of the directory to fetch. Fetches root if omitted.'),
});

const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    type: z.enum(['file', 'dir']),
    name: z.string(),
    path: z.string(),
    content: z.string().optional(),
    children: z.array(FileNodeSchema).optional(),
    sha: z.string().optional(),
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

export async function fetchFileContent({ owner, repo, path }: { owner: string, repo: string, path: string }): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    try {
        const contentResponse = await fetchFromApi(url);
        if (contentResponse.encoding === 'base64') {
            return Buffer.from(contentResponse.content, 'base64').toString('utf-8');
        }
        return 'Could not decode file content.';
    } catch (e) {
        console.error(`Could not fetch content for ${path}: ${e}`);
        return `Error fetching content for ${path}.`;
    }
}


async function getRepoTree(owner: string, repo: string, path: string = ''): Promise<FileNode[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const contents = await fetchFromApi(url);

    if (!Array.isArray(contents)) {
        throw new Error('Unexpected API response format. Expected an array of files/directories.');
    }

    return contents.map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        sha: item.sha,
        children: item.type === 'dir' ? [] : undefined,
    }));
}

export const fetchRepoContents = ai.defineTool(
  {
    name: "fetchRepoContents",
    description: "Fetches the file structure of a directory in a public GitHub repository.",
    inputSchema: FetchRepoContentsInputSchema,
    outputSchema: FetchRepoContentsOutputSchema,
  },
  async ({ repoPath, path }) => {
    const urlParts = repoPath.split('/');
    if (urlParts.length !== 2) {
      throw new Error('Invalid GitHub repository path. Please use the owner/repo format.');
    }
    const [owner, repo] = urlParts;
    
    try {
        return await getRepoTree(owner, repo, path);
    } catch (e) {
        console.error(`Error fetching tree for ${repoPath} at path ${path}:`, e);
        throw e;
    }
  }
);


export async function listGenerativeModels() {
    const allModels = await listModels();
    const supportedModels = new Set([gemini20Flash.name, gemini15Flash.name, gemini15Pro.name]);
    const generativeModels = allModels.filter(m => m.supportsGenerate && supportedModels.has(m.name));
    
    return generativeModels.map(m => ({
        id: m.name.split('/')[1]!,
        name: m.label
    }));
}
