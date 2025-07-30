"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { generateDocumentation } from "@/ai/flows/generate-documentation";
import { fetchRepoContents, fetchFileContent, type FileNode, listGenerativeModels } from "@/ai/tools/fetch-repo-contents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DocumentationDisplay } from "@/components/DocumentationDisplay";
import { Github, Loader2, Wand2, Folder, File as FileIcon, ChevronDown, ChevronRight, FolderOpen, Terminal, Sparkles, FolderGit2, Database, Cloud, X, Trash2 } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { Checkbox } from "./ui/checkbox";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "./ui/tooltip";

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

type Model = {
    id: string;
    name: string;
};

const CacheStatusIcon = ({ isLoadedFromCache }: { isLoadedFromCache?: boolean }) => {
    if (isLoadedFromCache === undefined) return null;
    
    return (
        <Tooltip>
            <TooltipTrigger>
                {isLoadedFromCache 
                    ? <Database className="h-4 w-4 text-muted-foreground" />
                    : <Cloud className="h-4 w-4 text-muted-foreground" />
                }
            </TooltipTrigger>
            <TooltipContent>
                <p>{isLoadedFromCache ? 'Loaded from cache' : 'Fetched from API'}</p>
            </TooltipContent>
        </Tooltip>
    )
};

export function DocumentationGenerator() {
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
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [cacheStatus, setCacheStatus] = useState<RepoState<{[path: string]: boolean}>>({});
  const [loadedPaths, setLoadedPaths] = useState<RepoState<{[path: string]: boolean}>>({});
  
  const { toast } = useToast();

  const form = useForm<z.infer<typeof repoFormSchema>>({
    resolver: zodResolver(repoFormSchema),
    defaultValues: { repoPath: "" },
  });

  useEffect(() => {
    async function loadModels() {
      try {
        const models = await listGenerativeModels();
        setAvailableModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
        toast({
          variant: "destructive",
          title: "Failed to load AI models.",
          description: "Sticking to default model.",
        });
      }
    }
    loadModels();
  }, [toast]);

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
  }

  async function handleFetchRepoStructure(repoPath: string, path?: string) {
    const cacheKey = `repo-cache-${repoPath}-${path || 'root'}`;
    const cached = getCachedData(cacheKey);

    if (cached) {
      updateTreeWithNewNodes(repoPath, cached, path);
      setCacheStatus(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path || 'root']: true}}));
      if (path) {
        setLoadedPaths(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path]: true}}));
      }
      return;
    }
    
    if (path) setLoadedPaths(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path]: true}}));

    try {
      const result = await fetchRepoContents({ repoPath, path });
      updateTreeWithNewNodes(repoPath, result, path);
      setCachedData(cacheKey, result);
      setCacheStatus(prev => ({...prev, [repoPath]: {...(prev[repoPath] || {}), [path || 'root']: false}}));
    } catch (error) {
      console.error(`Error fetching repository structure for path "${path}":`, error);
      toast({
        variant: "destructive",
        title: "Failed to fetch repository.",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
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

  async function handleGenerateDocs() {
    if (repoPaths.length === 0) return;
    
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

    if(selectedFilesToFetch.length === 0) {
        toast({
            variant: "destructive",
            title: "No files selected",
            description: "Please select at least one file to generate documentation.",
        });
        setIsLoading(false);
        setIsFetchingContent(false);
        return;
    }
    
    setGeneratedRepoUrl(repoPaths.map(p => `https://github.com/${p}`).join(', '));

    const fetchedFiles: { path: string, content: string }[] = [];

    for (const file of selectedFilesToFetch) {
        const [owner, repo] = file.repoPath.split('/');
        setLogs(prev => [...prev, `Fetching ${file.repoPath}/${file.path}...`]);
        try {
            const content = await fetchFileContent({ owner, repo, path: file.path });
            fetchedFiles.push({ path: `${file.repoPath}/${file.path}`, content });
            setLogs(prev => [...prev, `Fetched ${file.repoPath}/${file.path} successfully.`]);
        } catch (error) {
            setLogs(prev => [...prev, `Failed to fetch ${file.repoPath}/${file.path}.`]);
            toast({
                variant: "destructive",
                title: `Failed to fetch ${file.path}`,
                description: error instanceof Error ? error.message : "An unknown error occurred.",
            });
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
      setLogs(prev => [...prev, `Generating documentation with ${selectedModel}...`]);
      const result = await generateDocumentation({ files: fetchedFiles, model: selectedModel });
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
    let newRepoSelection = {...(fileSelection[repoPath] || {})};
    
    function traverse(items: FileNode[]) {
        items.forEach(item => {
            if (item.type === 'file') {
                newRepoSelection[item.path] = isSelected;
            } else if (item.type === 'dir' && item.children) {
                traverse(item.children);
            }
        });
    }
    
    traverse(nodes);
    setFileSelection(prev => ({...prev, [repoPath]: newRepoSelection}));
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

  const FileTreeView = ({ nodes, repoPath }: { nodes: FileNode[], repoPath: string }) => {
    const currentExpanded = expandedFolders[repoPath] || {};
    const currentCacheStatus = cacheStatus[repoPath] || {};
    const currentLoadedPaths = loadedPaths[repoPath] || {};
    const currentSelection = fileSelection[repoPath] || {};

    return (
      <ul className="space-y-1">
        {nodes.map(node => {
          if (node.type === 'dir') {
            const isExpanded = currentExpanded[node.path];
            const selectionState = getFolderSelectionState(repoPath, node.children);

            return (
              <li key={node.path}>
                <div className="flex items-center gap-2 py-1">
                    <Checkbox
                        id={`folder-${repoPath}-${node.path}`}
                        checked={selectionState}
                        onCheckedChange={(checked) => toggleFolderSelection(repoPath, node.children || [], !!checked)}
                        aria-label={`Select folder ${node.name}`}
                    />
                    <div 
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => toggleFolderExpansion(repoPath, node)}
                    >
                        {currentLoadedPaths[node.path] && (!node.children || node.children.length === 0)
                          ? <ChevronRight className="h-4 w-4 opacity-50" />
                          : isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                        }
                        {isExpanded ? <FolderOpen className="h-5 w-5 text-primary" /> : <Folder className="h-5 w-5 text-primary" />}
                        <label htmlFor={`folder-${repoPath}-${node.path}`} className="font-medium cursor-pointer">{node.name}</label>
                        <CacheStatusIcon isLoadedFromCache={currentCacheStatus[node.path]} />
                    </div>
                </div>
                {isExpanded && node.children && node.children.length > 0 && (
                  <div className="pl-6">
                    <FileTreeView nodes={node.children} repoPath={repoPath} />
                  </div>
                )}
                 {isExpanded && !node.children?.length && currentLoadedPaths[node.path] && (
                    <div className="pl-12 text-muted-foreground italic text-sm">empty</div>
                )}
              </li>
            );
          }
          return (
            <li key={node.path} className="flex items-center gap-2 pl-6 py-1">
              <Checkbox
                id={`${repoPath}-${node.path}`}
                checked={!!currentSelection[node.path]}
                onCheckedChange={(checked) => toggleSelection(repoPath, node.path, !!checked)}
                aria-label={`Select file ${node.name}`}
              />
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              <label htmlFor={`${repoPath}-${node.path}`} className="cursor-pointer">{node.name}</label>
            </li>
          );
        })}
      </ul>
    );
  };
  
  const LoadingSkeleton = () => (
    <Card className="mt-8 shadow-lg">
      <CardHeader>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <br/>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  )


  return (
    <>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center gap-2">
            <Github />
            Repository Input
          </CardTitle>
          <CardDescription>
            Enter repository paths in `owner/repo` format to analyze them. You can add multiple repositories.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onAddRepo)} className="flex flex-col sm:flex-row gap-4">
              <FormField
                control={form.control}
                name="repoPath"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <FormLabel className="sr-only">GitHub Repository Path</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. genkit-ai/genkit" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Repository'
                )}
              </Button>
            </form>
          </Form>

           {repoPaths.length > 0 && (
            <div className="mt-6">
                <h3 className="text-lg font-medium mb-2">Added Repositories</h3>
                <ul className="space-y-2">
                    {repoPaths.map(repoPath => (
                        <li key={repoPath} className="flex items-center justify-between p-2 border rounded-md bg-secondary">
                            <span className="font-mono text-sm">{repoPath}</span>
                            <Button variant="ghost" size="icon" onClick={() => removeRepository(repoPath)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>
           )}
        </CardContent>
      </Card>
      
      {repoPaths.length > 0 && (
        <Card className="mt-8 shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Select Files for Documentation</CardTitle>
            <CardDescription>
              Choose the files and folders you want to include in the documentation from your selected repositories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <ScrollArea className="h-96 w-full rounded-md border p-4">
                {repoPaths.map(repoPath => (
                    <div key={repoPath} className="mb-6">
                        {isFetchingRepo[repoPath] ? (
                             <div className="text-center"> <Loader2 className="h-8 w-8 animate-spin mx-auto" /> <p>Fetching {repoPath} structure...</p></div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 py-1">
                                    <Checkbox
                                        id={`root-selector-${repoPath}`}
                                        checked={getRootSelectionState(repoPath)}
                                        onCheckedChange={(checked) => toggleAllSelectionForRepo(repoPath, !!checked)}
                                        aria-label={`Select all files and folders in ${repoPath}`}
                                    />
                                    <div className="flex items-center gap-2">
                                        <FolderGit2 className="h-5 w-5 text-primary" />
                                        <label htmlFor={`root-selector-${repoPath}`} className="font-medium cursor-pointer">
                                        {repoPath}
                                        </label>
                                        <CacheStatusIcon isLoadedFromCache={cacheStatus[repoPath]?.['root']} />
                                    </div>
                                </div>
                                <div className="pl-6 border-l border-dashed ml-2 mt-2">
                                    {repoTrees[repoPath] && <FileTreeView nodes={repoTrees[repoPath]} repoPath={repoPath} />}
                                </div>
                            </>
                        )}
                    </div>
                ))}
              </ScrollArea>
            </TooltipProvider>
             <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
                <Button onClick={handleGenerateDocs} disabled={isLoading || isFetchingContent} className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
                {isLoading || isFetchingContent ? (
                    <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isFetchingContent ? 'Fetching Files...' : 'Generating...'}
                    </>
                ) : (
                    <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Docs for Selected Files
                    </>
                )}
                </Button>
                <div className="flex items-center gap-2">
                    <Label htmlFor="model-select" className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="h-4 w-4" /> AI Model
                    </Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel} disabled={availableModels.length === 0}>
                        <SelectTrigger id="model-select" className="w-full sm:w-[200px]">
                            <SelectValue placeholder={availableModels.length > 0 ? "Select a model" : "Loading models..."} />
                        </SelectTrigger>
                        <SelectContent>
                            {availableModels.map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                    {model.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(isFetchingContent || isLoading || (logs && logs.length > 0)) && (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle className="font-headline text-2xl flex items-center gap-2"><Terminal/>Logs</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-48 w-full bg-muted rounded-md p-4" ref={logContainerRef}>
                    {logs.map((log, index) => (
                        <p key={index} className="text-sm font-mono whitespace-pre-wrap">{`> ${log}`}</p>
                    ))}
                     {(isFetchingContent || isLoading) && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
                </ScrollArea>
            </CardContent>
        </Card>
      )}

      {isLoading && !documentation && <LoadingSkeleton />}
      {documentation && !isLoading && (
        <DocumentationDisplay documentation={documentation} repoUrl={generatedRepoUrl}/>
      )}
    </>
  );
}
