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
import { Github, Loader2, Wand2, Folder, File as FileIcon, ChevronDown, ChevronRight, FolderOpen, Terminal, Sparkles, FolderGit2, Database, Cloud } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { Checkbox } from "./ui/checkbox";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const formSchema = z.object({
  repoPath: z.string().min(1, { message: "Please enter a repository path." }).refine(
    (path) => /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/.test(path),
    "Please enter a valid `owner/repo` path."
  ),
});

type FileSelection = { [path: string]: boolean };

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
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingRepo, setIsFetchingRepo] = useState(false);
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [repoTree, setRepoTree] = useState<FileNode[]>([]);
  const [fileSelection, setFileSelection] = useState<FileSelection>({});
  const [expandedFolders, setExpandedFolders] = useState<{[path: string]: boolean}>({});
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [cacheStatus, setCacheStatus] = useState<{[path: string]: boolean}>({});
  const [loadedPaths, setLoadedPaths] = useState<{[path: string]: boolean}>({});
  const [currentRepoPath, setCurrentRepoPath] = useState<string>("");

  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
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

  const resetState = () => {
    setDocumentation(null);
    setRepoTree([]);
    setFileSelection({});
    setExpandedFolders({});
    setCacheStatus({});
    setLoadedPaths({});
    setCurrentRepoPath("");
    setRepoUrl("");
  };

  async function handleFetchRepoStructure(repoPath: string, path?: string) {
    const cacheKey = `repo-cache-${repoPath}-${path || 'root'}`;
    const cached = getCachedData(cacheKey);

    if (cached) {
      updateTreeWithNewNodes(cached, path);
      setCacheStatus(prev => ({...prev, [path || 'root']: true}));
      if (path) {
        setLoadedPaths(prev => ({...prev, [path]: true}));
      }
      return;
    }
    
    if (path) setLoadedPaths(prev => ({...prev, [path]: true}));

    try {
      const result = await fetchRepoContents({ repoPath, path });
      updateTreeWithNewNodes(result, path);
      setCachedData(cacheKey, result);
      setCacheStatus(prev => ({...prev, [path || 'root']: false}));
    } catch (error) {
      console.error(`Error fetching repository structure for path "${path}":`, error);
      toast({
        variant: "destructive",
        title: "Failed to fetch repository.",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
      if (path) setLoadedPaths(prev => ({...prev, [path]: false})); // Allow retry
    }
  }
  
  const updateTreeWithNewNodes = (nodes: FileNode[], parentPath?: string) => {
    const newSelection = {...fileSelection};
    nodes.forEach(node => {
        if(node.type === 'file') {
            newSelection[node.path] = fileSelection[node.path] || false;
        }
    });
    setFileSelection(newSelection);

    if (!parentPath) {
      setRepoTree(nodes);
      return;
    }
    
    setRepoTree(prevTree => {
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
        return updateChildren(prevTree);
    });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    resetState();
    setIsFetchingRepo(true);
    setCurrentRepoPath(values.repoPath);
    setRepoUrl(`https://github.com/${values.repoPath}`);
    await handleFetchRepoStructure(values.repoPath);
    setIsFetchingRepo(false);
  }

  async function handleGenerateDocs() {
    if (repoTree.length === 0) return;
    
    setIsLoading(true);
    setDocumentation(null);
    setLogs([]);
    setIsFetchingContent(true);

    const selectedFilesToFetch: { path: string }[] = Object.entries(fileSelection)
        .filter(([,isSelected]) => isSelected)
        .map(([path]) => ({path}));

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

    const [owner, repo] = form.getValues('repoPath').split('/');
    const fetchedFiles: { path: string, content: string }[] = [];

    for (const file of selectedFilesToFetch) {
        setLogs(prev => [...prev, `Fetching ${file.path}...`]);
        try {
            const content = await fetchFileContent({ owner, repo, path: file.path });
            fetchedFiles.push({ path: file.path, content });
            setLogs(prev => [...prev, `Fetched ${file.path} successfully.`]);
        } catch (error) {
            setLogs(prev => [...prev, `Failed to fetch ${file.path}.`]);
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

  const toggleSelection = (path: string, isSelected: boolean) => {
    setFileSelection(prev => ({...prev, [path]: isSelected}));
  };
  
  const toggleFolderSelection = (nodes: FileNode[], isSelected: boolean) => {
    let newSelection = {...fileSelection};
    
    function traverse(items: FileNode[]) {
        items.forEach(item => {
            if (item.type === 'file') {
                newSelection[item.path] = isSelected;
            } else if (item.type === 'dir' && item.children) {
                traverse(item.children);
            }
        });
    }
    
    traverse(nodes);
    setFileSelection(newSelection);
  };

  const toggleFolderExpansion = (node: FileNode) => {
    const { path, children } = node;
    if (!children || (children.length === 0 && !loadedPaths[path])) {
        handleFetchRepoStructure(currentRepoPath, path);
    }
    setExpandedFolders(prev => ({...prev, [path]: !prev[path]}));
  };
  
  const getFolderSelectionState = (nodes?: FileNode[]): boolean | 'indeterminate' => {
    if (!nodes || nodes.length === 0) return false;
    let hasSelectedFile = false;
    let hasUnselectedFile = false;

    function traverse(items: FileNode[]) {
      for (const item of items) {
        if (hasSelectedFile && hasUnselectedFile) break;
        if (item.type === 'file') {
          if (fileSelection[item.path]) {
            hasSelectedFile = true;
          } else if (fileSelection[item.path] === false) {
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
  
  const toggleAllSelection = (isSelected: boolean) => {
      if (!repoTree) return;
      toggleFolderSelection(repoTree, isSelected);
  };
  
  const getRootSelectionState = (): boolean | 'indeterminate' => {
      if (!repoTree) return false;
      return getFolderSelectionState(repoTree);
  };

  const FileTreeView = ({ nodes, parentPath = '' }: { nodes: FileNode[], parentPath?: string }) => {
    return (
      <ul className="space-y-1">
        {nodes.map(node => {
          if (node.type === 'dir') {
            const isExpanded = expandedFolders[node.path];
            const selectionState = getFolderSelectionState(node.children);

            return (
              <li key={node.path}>
                <div className="flex items-center gap-2 py-1">
                    <Checkbox
                        id={`folder-${node.path}`}
                        checked={selectionState}
                        onCheckedChange={(checked) => toggleFolderSelection(node.children || [], !!checked)}
                        aria-label={`Select folder ${node.name}`}
                    />
                    <div 
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => toggleFolderExpansion(node)}
                    >
                        {loadedPaths[node.path] && (!node.children || node.children.length === 0)
                          ? <ChevronRight className="h-4 w-4 opacity-50" />
                          : isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                        }
                        {isExpanded ? <FolderOpen className="h-5 w-5 text-primary" /> : <Folder className="h-5 w-5 text-primary" />}
                        <label htmlFor={`folder-${node.path}`} className="font-medium cursor-pointer">{node.name}</label>
                        <CacheStatusIcon isLoadedFromCache={cacheStatus[node.path]} />
                    </div>
                </div>
                {isExpanded && node.children && node.children.length > 0 && (
                  <div className="pl-6">
                    <FileTreeView nodes={node.children} parentPath={node.path} />
                  </div>
                )}
                 {isExpanded && !node.children?.length && loadedPaths[node.path] && (
                    <div className="pl-12 text-muted-foreground italic text-sm">empty</div>
                )}
              </li>
            );
          }
          return (
            <li key={node.path} className="flex items-center gap-2 pl-6 py-1">
              <Checkbox
                id={node.path}
                checked={!!fileSelection[node.path]}
                onCheckedChange={(checked) => toggleSelection(node.path, !!checked)}
                aria-label={`Select file ${node.name}`}
              />
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              <label htmlFor={node.path} className="cursor-pointer">{node.name}</label>
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
            Enter the repository path in `owner/repo` format to analyze its structure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="repoPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub Repository Path</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. genkit-ai/genkit" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isFetchingRepo} className="w-full sm:w-auto">
                {isFetchingRepo ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  'Fetch Repository'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {isFetchingRepo && <div className="mt-8 text-center"> <Loader2 className="h-8 w-8 animate-spin mx-auto" /> <p>Fetching repository structure...</p></div>}

      {repoTree.length > 0 && !isFetchingRepo && (
        <Card className="mt-8 shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Select Files for Documentation</CardTitle>
            <CardDescription>
              Choose the files and folders you want to include in the documentation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <ScrollArea className="h-72 w-full rounded-md border p-4">
                <div className="flex items-center gap-2 py-1">
                  <Checkbox
                    id="root-selector"
                    checked={getRootSelectionState()}
                    onCheckedChange={(checked) => toggleAllSelection(!!checked)}
                    aria-label="Select all files and folders"
                  />
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="h-5 w-5 text-primary" />
                    <label htmlFor="root-selector" className="font-medium cursor-pointer">
                      {form.getValues('repoPath')}
                    </label>
                    <CacheStatusIcon isLoadedFromCache={cacheStatus['root']} />
                  </div>
                </div>
                <div className="pl-6 border-l border-dashed ml-2 mt-2">
                  <FileTreeView nodes={repoTree} />
                </div>
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
        <DocumentationDisplay documentation={documentation} repoUrl={repoUrl}/>
      )}
    </>
  );
}
