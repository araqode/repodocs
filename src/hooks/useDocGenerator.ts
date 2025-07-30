"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { generateDocumentation } from "@/ai/actions/generate-documentation.action";
import { fetchRepoContents, fetchFileContent, type FileNode } from "@/ai/tools/fetch-repo-contents";
import { useToast } from "@/hooks/use-toast";

const repoFormSchema = z.object({
  repoPath: z.string().min(1, { message: "Please enter a repository path." }).refine(
    (path) => /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/.test(path),
    "Please enter a valid `owner/repo` path."
  ),
});

type FileSelection = { [path: string]: boolean };
type RepoFileSelection = { [repoPath: string]: FileSelection };
type RepoTree = { [repoPath: string]: FileNode[] };
type RepoState<T> = { [repoPath: string]: T };

type ApiKeys = {
    gemini: string;
    github: string;
};

const defaultPrompt = `Please provide a high-level overview of the project, including its purpose and key features. Then, for each file, describe its role and functionality. Finally, detail the relationships and interactions between the different files and components.`;

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
  
  useEffect(() => {
    const storedKeys = getCachedData('api-keys');
    if (storedKeys) {
      setApiKeys(storedKeys);
    }
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const getCachedData = useCallback((key: string) => {
    try {
      const cachedData = localStorage.getItem(key);
      if(cachedData) return JSON.parse(cachedData);
    } catch (error) {
      console.error("Failed to read from local storage:", error);
      localStorage.removeItem(key);
    }
    return null;
  }, []);

  const setCachedData = useCallback((key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to write to local storage:", error);
    }
  }, []);

  const resetGenerationState = () => {
    setDocumentation(null);
    setGeneratedRepoUrl("");
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
    setIsFetchingContent(true);

    const selectedFilesToFetch: {repoPath: string, path: string}[] = [];
    repoPaths.forEach(repoPath => {
        const selection = fileSelection[repoPath] || {};
        const selected = Object.entries(selection)
            .filter(([,isSelected]) => isSelected)
            .map(([path]) => ({repoPath, path}));
        selectedFilesToFetch.push(...selected);
    });
    
    setGeneratedRepoUrl(repoPaths.map(p => `https://github.com/${p}`).join(', '));

    const fetchedFiles: { path: string, content: string }[] = [];

    for (const file of selectedFilesToFetch) {
        const [owner, repo] = file.repoPath.split('/');
        const filePath = `${file.repoPath}/${file.path}`;
        const cacheKey = `file-content-cache-${filePath}`;
        
        const cachedContent = getCachedData(cacheKey);

        if (cachedContent && cachedContent.content) {
            fetchedFiles.push({ path: filePath, content: cachedContent.content });
            setFileSizes(prev => ({ ...prev, [file.repoPath]: { ...(prev[file.repoPath] || {}), [file.path]: cachedContent.size } }));
            setLogs(prev => [...prev, `Using cached content for ${filePath}.`]);
        } else {
            setLogs(prev => [...prev, `Fetching ${filePath}...`]);
            try {
                const content = await fetchFileContent({ owner: owner!, repo: repo!, path: file.path, apiKey: apiKeys.github });
                const size = new Blob([content]).size;
                fetchedFiles.push({ path: filePath, content });
                setCachedData(cacheKey, { content, size });
                setFileSizes(prev => ({ ...prev, [file.repoPath]: { ...(prev[file.repoPath] || {}), [file.path]: size } }));
                setLogs(prev => [...prev, `Fetched ${filePath} successfully.`]);
            } catch (error) {
                setLogs(prev => [...prev, `Failed to fetch ${filePath}.`]);
                toast({
                    variant: "destructive",
                    title: `Failed to fetch ${file.path}`,
                    description: error instanceof Error ? error.message : "An unknown error occurred.",
                });
            }
        }
    }
    setIsFetchingContent(false);
    
    if (fetchedFiles.length === 0) {
        toast({
            variant: "destructive",
            title: "Failed to fetch content",
            description: "Could not fetch content for any of the selected files.",
        });
        setIsLoading(false);
        return;
    }

    try {
      setLogs(prev => [...prev, `Generating documentation...`]);
      const result = await generateDocumentation({ 
        files: fetchedFiles, 
        userPrompt: editablePrompt,
        apiKey: apiKeys.gemini 
      });
      if (result.documentation) {
        setDocumentation(result.documentation);
        setLogs(prev => [...prev, 'Documentation generated successfully!']);
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
       setLogs(prev => [...prev, `Error: ${errorMessage}`]);
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
          if (isSelected && (!childrenToTraverse || childrenToTraverse.length === 0)) {
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
