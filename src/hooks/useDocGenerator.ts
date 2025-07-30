
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useToast } from "@/hooks/use-toast";
import type { FileNode } from "@/types/file-node";

const repoFormSchema = z.object({
  repoPath: z.string().min(1, { message: "Please enter a repository path." }).refine(
    (path) => /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/.test(path),
    "Please enter a valid `owner/repo` path."
  ),
});

type FileSelection = { [path: string]: boolean };
type RepoFileSelection = { [repoPath: string]: FileSelection };
type RepoTree = { [repoPath: string]: FileNode[] };
type RepoState<T> = { [repoPath:string]: T };

type ApiKeys = {
    gemini: string;
    github: string;
};

type AiInteraction = {
  request: string;
  response: any;
};

const defaultPrompt = `Please provide a high-level overview of the project, including its purpose and key features. Then, for each file, describe its role and functionality. Finally, detail the relationships and interactions between the different files and components.`;

const GITHUB_API_THROTTLE_MS = 200;

// --- GitHub API Client-Side Functions ---

async function fetchFromGitHubApi(url: string, apiKey?: string) {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GitHub API request failed with status ${response.status}: ${errorBody}`);
    }
    return response.json();
}

async function fetchRepoContents({ repoPath, path, apiKey }: { repoPath: string, path?: string, apiKey?: string }): Promise<FileNode[]> {
    const [owner, repo] = repoPath.split('/');
    if (!owner || !repo) {
        throw new Error('Invalid repo path format. Expected owner/repo.');
    }
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path || ''}`;
    const contents = await fetchFromGitHubApi(url, apiKey);
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


async function fetchFileContent({ owner, repo, path, apiKey }: { owner: string, repo: string, path: string, apiKey?: string }): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    try {
        const contentResponse = await fetchFromGitHubApi(url, apiKey);
        if (contentResponse.encoding === 'base64') {
            // Buffer is not available in the browser, use atob
            return atob(contentResponse.content);
        }
        return 'Could not decode file content.';
    } catch (e) {
        console.error(`Could not fetch content for ${path}: ${e}`);
        return `Error fetching content for ${path}.`;
    }
}


// --- Gemini API Client-Side Functions ---

async function callGeminiAPI(apiKey: string, prompt: string) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
            }
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error:", errorBody);
        throw new Error(`Gemini API request failed with status ${response.status}. See console for details.`);
    }

    const data = await response.json();
    
    try {
        // The response from Gemini is a stringified JSON inside the 'text' field
        const textResponse = data.candidates[0].content.parts[0].text;
        return JSON.parse(textResponse);
    } catch (e) {
        console.error("Failed to parse Gemini response:", data);
        throw new Error("Could not parse the response from the AI. The format was unexpected.");
    }
}


export function useDocGenerator() {
  const [documentation, setDocumentation] = useState<string | null>(null);
  const [generatedRepoUrl, setGeneratedRepoUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingRepo, setIsFetchingRepo] = useState<RepoState<boolean>>({});
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [repoTrees, setRepoTrees] = useState<RepoTree>({});
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [fileSelection, setFileSelection] = useState<RepoFileSelection>({});
  const [expandedFolders, setExpandedFolders] = useState<RepoState<{[path: string]: boolean}>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [aiInteractions, setAiInteractions] = useState<AiInteraction[]>([]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [cacheStatus, setCacheStatus] = useState<RepoState<{[path: string]: boolean}>>({});
  const [loadedPaths, setLoadedPaths] = useState<RepoState<{[path: string]: boolean}>>({});
  const [fileSizes, setFileSizes] = useState<RepoState<{[path: string]: number}>>({});
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ gemini: '', github: '' });
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState(defaultPrompt);

  
  const { toast } = useToast();

  const form = useForm<z.infer<typeof repoFormSchema>>({
    resolver: zodResolver(repoFormSchema),
    defaultValues: { repoPath: "" },
  });
  
  const getCachedData = useCallback((key: string) => {
    try {
      const cachedData = localStorage.getItem(key);
      if(cachedData) return JSON.parse(cachedData);
    } catch (error) {
      console.error("Failed to read from local storage:", error);
    }
  }, []);

  const setCachedData = useCallback((key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to write to local storage:", error);
    }
  }, []);
  
  useEffect(() => {
    const storedKeys = getCachedData('api-keys');
    if (storedKeys) {
      setApiKeys(storedKeys);
    }
  }, [getCachedData]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);


  const resetGenerationState = () => {
    setDocumentation(null);
    setGeneratedRepoUrl("");
    setAiInteractions([]);
  };
  
  const removeRepository = (repoPathToRemove: string) => {
    setRepoPaths(prev => prev.filter(p => p !== repoPathToRemove));
    setRepoTrees(prev => {
      const next = {...prev};
      delete next[repoPathToRemove];
      return next;
    });
    setFileSelection(prev => {
      const next = {...prev};
      delete next[repoPathToRemove];
      return next;
    });
    setExpandedFolders(prev => {
        const next = {...prev};
        delete next[repoPathToRemove];
        return next;
    });
    setCacheStatus(prev => {
        const next = {...prev};
        delete next[repoPathToRemove];
        return next;
    });
     setLoadedPaths(prev => {
        const next = {...prev};
        delete next[repoPathToRemove];
        return next;
    });
    setFileSizes(prev => {
        const next = {...prev};
        delete next[repoPathToRemove];
        return next;
    });
  }

  async function handleFetchRepoStructure(repoPath: string, path?: string): Promise<FileNode[] | undefined> {
    const cacheKey = `repo-cache-${repoPath}-${path || 'root'}`;
    const cached = getCachedData(cacheKey);

    if (cached) {
      updateTreeWithNewNodes(repoPath, cached, path);
      setCacheStatus(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path || 'root']: true}}));
      if (path) {
        setLoadedPaths(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path]: true}}));
      }
      return cached;
    }
    
    if (path) setLoadedPaths(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path]: true}}));

    try {
      await new Promise(resolve => setTimeout(resolve, GITHUB_API_THROTTLE_MS));
      const result = await fetchRepoContents({ repoPath, path, apiKey: apiKeys.github });
      updateTreeWithNewNodes(repoPath, result, path);
      setCachedData(cacheKey, result);
      setCacheStatus(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path || 'root']: false}}));
      return result;
    } catch (error) {
      console.error(`Error fetching repository structure for path "${path}":`, error);
      toast({
        variant: "destructive",
        title: "Failed to fetch repository.",
        description: error instanceof Error ? error.message : "An unknown error occurred. Check your GitHub token.",
      });
      if (path) setLoadedPaths(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path]: false}})); // Allow retry
    }
  }
  
  const updateTreeWithNewNodes = (repoPath: string, nodes: FileNode[], parentPath?: string) => {
    const newRepoSelection = {...(fileSelection[repoPath] || {})};
    nodes.forEach(node => {
        if(node.type === 'file') {
            newRepoSelection[node.path] = newRepoSelection[node.path] || false;
        }
    });
    setFileSelection(prev => ({...prev, [repoPath]: newRepoSelection}));

    if (!parentPath) {
      setRepoTrees(prev => ({...prev, [repoPath]: nodes}));
      return;
    }
    
    setRepoTrees(prevTrees => {
        const updateChildren = (items: FileNode[]): FileNode[] => {
            return items.map(item => {
                if (item.path === parentPath) {
                    return {...item, children: nodes};
                }
                if (item.children && item.children.length > 0) {
                    return {...item, children: updateChildren(item.children)};
                }
                return item;
            });
        };
        const updatedTree = updateChildren(prevTrees[repoPath] || []);
        return {...prevTrees, [repoPath]: updatedTree};
    });
  };

  async function onAddRepo(values: z.infer<typeof repoFormSchema>) {
    if (repoPaths.includes(values.repoPath)) {
        toast({
            title: "Repository already added.",
            description: "This repository is already in the list.",
        });
        return;
    }

    setIsFetchingRepo(prev => ({...prev, [values.repoPath]: true}));
    resetGenerationState();
    
    await handleFetchRepoStructure(values.repoPath);
    setRepoPaths(prev => [...prev, values.repoPath]);
    
    setIsFetchingRepo(prev => ({...prev, [values.repoPath]: false}));
    form.reset();
  }
  
  const onGenerateClick = () => {
    if (repoPaths.length === 0) return;
    if (!apiKeys.gemini) {
      toast({
        variant: "destructive",
        title: "Missing API Key",
        description: "Please enter your Gemini API key in the settings.",
      });
      setIsApiSettingsOpen(true);
      return;
    }
    
    const selectedFilesToFetch: {repoPath: string, path: string}[] = [];
    repoPaths.forEach(repoPath => {
        const selection = fileSelection[repoPath] || {};
        const selected = Object.entries(selection)
            .filter(([,isSelected]) => isSelected)
            .map(([path]) => ({repoPath, path}));
        selectedFilesToFetch.push(...selected);
    });

    if(selectedFilesToFetch.length === 0) {
        toast({
            variant: "destructive",
            title: "No files selected",
            description: "Please select at least one file to generate documentation.",
        });
        return;
    }
    
    setIsPromptModalOpen(true);
  };
  
  async function confirmAndGenerate() {
    setIsPromptModalOpen(false);
    setIsLoading(true);
    setDocumentation(null);
    setLogs([]);
    setAiInteractions([]);
    setGeneratedRepoUrl(repoPaths.map(p => `https://github.com/${p}`).join(', '));
    
    const fetchedFiles: { path: string, content: string }[] = [];

    // Step 1: Fetching file contents
    setIsFetchingContent(true);
    setLogs(prev => [...prev, "Step 1: Fetching content for selected files..."]);

    const selectedFilesToFetch: {repoPath: string, path: string}[] = [];
    repoPaths.forEach(repoPath => {
        const selection = fileSelection[repoPath] || {};
        const selected = Object.entries(selection)
            .filter(([,isSelected]) => isSelected)
            .map(([path]) => ({repoPath, path}));
        selectedFilesToFetch.push(...selected);
    });

    for (const file of selectedFilesToFetch) {
        const [owner, repo] = file.repoPath.split('/');
        const filePath = `${file.repoPath}/${file.path}`;
        const cacheKey = `file-content-cache-${filePath}`;
        
        const cachedContent = getCachedData(cacheKey);

        if (cachedContent && cachedContent.content) {
            fetchedFiles.push({ path: filePath, content: cachedContent.content });
            setFileSizes(prev => ({ ...prev, [file.repoPath]: { ...(prev[file.repoPath] || {}), [file.path]: cachedContent.size } }));
            setLogs(prev => [...prev, `  [CACHE] Using cached content for ${filePath}.`]);
        } else {
            setLogs(prev => [...prev, `  [API] Fetching ${filePath}...`]);
            try {
                await new Promise(resolve => setTimeout(resolve, GITHUB_API_THROTTLE_MS));
                const content = await fetchFileContent({ owner: owner!, repo: repo!, path: file.path, apiKey: apiKeys.github });
                const size = new Blob([content]).size;
                fetchedFiles.push({ path: filePath, content });
                setCachedData(cacheKey, { content, size });
                setFileSizes(prev => ({ ...prev, [file.repoPath]: { ...(prev[file.repoPath] || {}), [file.path]: size } }));
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
                setLogs(prev => [...prev, `  [ERROR] Failed to fetch ${filePath}: ${errorMessage}`]);
                toast({
                    variant: "destructive",
                    title: `Failed to fetch ${file.path}`,
                    description: errorMessage,
                });
            }
        }
    }
    setLogs(prev => [...prev, "Step 1: Finished fetching file contents."]);
    setIsFetchingContent(false);
    
    if (fetchedFiles.length === 0) {
        toast({
            variant: "destructive",
            title: "Failed to fetch content",
            description: "Could not fetch content for any of the selected files. Check logs for details.",
        });
        setIsLoading(false);
        return;
    }

    // Step 2: Generating documentation
    try {
      setLogs(prev => [...prev, `Step 2: Starting documentation generation with AI...`]);
      setLogs(prev => [...prev, `  [AI] Summarizing ${fetchedFiles.length} file(s)...`]);
      
      const summaries = [];
      const configFilesRegex = /(\.(json|lock|config|rc|md|yml|yaml)|LICENSE)$/i;

      for (const file of fetchedFiles) {
          setLogs(prev => [...prev, `  Summarizing file: ${file.path}`]);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit

          const isConfigFile = configFilesRegex.test(file.path);
          
          const summarizeFilePrompt = `You are an expert technical writer. Your response must be a JSON object with keys "path" and "summary".
            
            Analyze the following file.
            File Path: ${file.path}
            Content:
            '''
            ${file.content}
            '''
            
            Instructions:
            ${isConfigFile 
              ? "This appears to be a config or metadata file. Provide a brief, one-sentence description of its purpose."
              : "Provide a concise summary covering the file's primary purpose, its key functions/classes/components, and its role in the project."
            }
            `;
            
            const summaryResponse = await callGeminiAPI(apiKeys.gemini, summarizeFilePrompt);
            setAiInteractions(prev => [...prev, {request: summarizeFilePrompt, response: summaryResponse}]);
            summaries.push(summaryResponse);
      }
      
      setLogs(prev => [...prev, `  [AI] Synthesizing final documentation...`]);
      
      const synthesizeDocumentationPrompt = `You are an expert technical writer. You will be given a series of file summaries from a codebase. Your task is to synthesize these into a single, comprehensive technical document in Markdown format.
      
      Your response must be a JSON object with a single key "documentation".
      
      User's Goal: "${editablePrompt}"
      
      File Summaries:
      ${JSON.stringify(summaries, null, 2)}
      
      Instructions:
      1.  Create a high-level overview of the project based on the user's goal and the file summaries.
      2.  For each file, provide a detailed description based on its summary.
      3.  Analyze and explain the relationships and interactions between different files.
      4.  Format the entire output as a single Markdown string with clear headings, lists, and code blocks for readability.
      5.  Use dashed-underline for inline hrefs/links for documentation to file mapping.
      `;

      const finalResponse = await callGeminiAPI(apiKeys.gemini, synthesizeDocumentationPrompt);
      setAiInteractions(prev => [...prev, {request: synthesizeDocumentationPrompt, response: finalResponse}]);

      if (finalResponse.documentation) {
        setDocumentation(finalResponse.documentation);
        setLogs(prev => [...prev, 'Step 2: Documentation generated successfully!']);
        toast({
            title: "Success!",
            description: "Documentation generated successfully.",
        });
      } else {
        throw new Error("The generated documentation is empty.");
      }
    } catch (error) {
      console.error("Error generating documentation:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      setLogs(prev => [...prev, `  [ERROR] ${errorMessage}`]);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: `Failed to generate documentation. ${errorMessage}`,
      });
      setDocumentation(null);
    } finally {
      setIsLoading(false);
    }
  }

  const toggleSelection = (repoPath: string, path: string, isSelected: boolean) => {
    setFileSelection(prev => ({
        ...prev,
        [repoPath]: {
            ...(prev[repoPath] || {}),
            [path]: isSelected
        }
    }));
  };
  
  const toggleFolderSelection = (repoPath: string, nodes: FileNode[], isSelected: boolean) => {
    const newRepoSelection = { ...(fileSelection[repoPath] || {}) };
    
    async function traverse(items: FileNode[]) {
      for (const item of items) {
        if (item.type === 'file') {
          newRepoSelection[item.path] = isSelected;
        } else if (item.type === 'dir') {
          let childrenToTraverse = item.children;
          if (isSelected && (!childrenToTraverse || childrenToTraverse.length === 0) && !loadedPaths[repoPath]?.[item.path]) {
            const fetchedChildren = await handleFetchRepoStructure(repoPath, item.path);
            if (fetchedChildren) {
              childrenToTraverse = fetchedChildren;
            }
          }
          if (childrenToTraverse) {
            await traverse(childrenToTraverse);
          }
        }
      }
    }
    
    traverse(nodes).then(() => {
        setFileSelection(prev => ({...prev, [repoPath]: newRepoSelection}));
    });
  };

  const toggleFolderExpansion = (repoPath: string, node: FileNode) => {
    const { path, children } = node;
    const repoLoadedPaths = loadedPaths[repoPath] || {};
    if (!children || (children.length === 0 && !repoLoadedPaths[path])) {
        handleFetchRepoStructure(repoPath, path);
    }
    setExpandedFolders(prev => ({
        ...prev, 
        [repoPath]: {
            ...(prev[repoPath] || {}),
            [path]: !prev[repoPath]?.[path]
        }
    }));
  };
  
  const getFolderSelectionState = (repoPath: string, nodes?: FileNode[]): boolean | 'indeterminate' => {
    if (!nodes || nodes.length === 0) return false;
    let hasSelectedFile = false;
    let hasUnselectedFile = false;
    const currentSelection = fileSelection[repoPath] || {};

    function traverse(items: FileNode[]) {
      for (const item of items) {
        if (hasSelectedFile && hasUnselectedFile) break;
        if (item.type === 'file') {
          if (currentSelection[item.path]) {
            hasSelectedFile = true;
          } else if (currentSelection[item.path] === false) {
            hasUnselectedFile = true;
          }
        } else if (item.type === 'dir' && item.children) {
          traverse(item.children);
        }
      }
    }
    traverse(nodes);
    
    if (hasSelectedFile && hasUnselectedFile) return 'indeterminate';
    if (hasSelectedFile && !hasUnselectedFile) return true;
    return false;
  };
  
  const toggleAllSelectionForRepo = (repoPath: string, isSelected: boolean) => {
      const tree = repoTrees[repoPath];
      if (!tree) return;
      toggleFolderSelection(repoPath, tree, isSelected);
  };
  
  const getRootSelectionState = (repoPath: string): boolean | 'indeterminate' => {
      const tree = repoTrees[repoPath];
      if (!tree) return false;
      return getFolderSelectionState(repoPath, tree);
  };
  
  const handleSetApiKeys = (keys: ApiKeys) => {
    setApiKeys(keys);
    setCachedData('api-keys', keys);
  };

  return {
    form,
    onAddRepo,
    repoPaths,
    removeRepository,
    isFetchingRepo,
    repoTrees,
    fileSelection,
    expandedFolders,
    logs,
    aiInteractions,
    logContainerRef,
    cacheStatus,
    loadedPaths,
    documentation,
    generatedRepoUrl,
    isLoading,
    isFetchingContent,
    onGenerateClick,
    confirmAndGenerate,
    toggleSelection,
    toggleFolderSelection,
    toggleFolderExpansion,
    getFolderSelectionState,
    toggleAllSelectionForRepo,
    getRootSelectionState,
    fileSizes,
    apiKeys,
    setApiKeys: handleSetApiKeys,
    isApiSettingsOpen,
    setIsApiSettingsOpen,
    isPromptModalOpen,
    setIsPromptModalOpen,
    editablePrompt,
    setEditablePrompt,
  };
}
