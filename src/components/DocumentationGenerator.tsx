"use client";

import { useState, useEffect, useRef } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

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

const CacheStatusIcon = ({ path, cacheStatus }: { path: string, cacheStatus: {[path: string]: boolean} }) => {
    const isLoadedFromCache = cacheStatus[path];
    
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
  const [repoTree, setRepoTree] = useState<FileNode[] | null>(null);
  const [fileSelection, setFileSelection] = useState<FileSelection>({});
  const [expandedFolders, setExpandedFolders] = useState<{[path: string]: boolean}>({});
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [cacheStatus, setCacheStatus] = useState<{[path: string]: boolean}>({});


  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      repoPath: "",
    },
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

  const getRepoDataFromCache = (path: string) => {
    try {
      const cachedData = localStorage.getItem(`repo-cache-${path}`);
      if(cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (error) {
        console.error("Failed to read from local storage:", error);
        localStorage.removeItem(`repo-cache-${path}`);
    }
    return null;
  }

  const setRepoDataToCache = (path: string, data: any) => {
    try {
        localStorage.setItem(`repo-cache-${path}`, JSON.stringify(data));
    } catch (error) {
        console.error("Failed to write to local storage:", error);
    }
  }

  const checkCacheStatus = (nodes: FileNode[], repoPath: string) => {
    const status: {[path: string]: boolean} = {};
    const cachedRepo = getRepoDataFromCache(repoPath);
    
    function traverse(items: FileNode[], currentPath = '') {
        items.forEach(item => {
            const path = currentPath ? `${currentPath}/${item.name}` : item.name;
            status[path] = !!cachedRepo; // Simplified: if repo is cached, all its initial structure is.
            if (item.children) {
                traverse(item.children, path);
            }
        });
    }
    traverse(nodes);
    setCacheStatus(status);
  };


  async function handleFetchRepo(path: string) {
    setIsFetchingRepo(true);
    setDocumentation(null);
    setRepoTree(null);

    const cached = getRepoDataFromCache(path);
    if (cached) {
      setRepoTree(cached);
      initializeSelection(cached);
      checkCacheStatus(cached, path);
      setIsFetchingRepo(false);
      return;
    }

    try {
      const result = await fetchRepoContents({ repoPath: path });
      setRepoTree(result);
      initializeSelection(result);
      checkCacheStatus(result, path);
      setRepoDataToCache(path, result);
    } catch (error) {
      console.error("Error fetching repository:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch repository.",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
      setIsFetchingRepo(false);
    }
  }

  const initializeSelection = (nodes: FileNode[]) => {
    const selection: FileSelection = {};
    const expansion: {[path: string]: boolean} = {};
    
    function traverse(items: FileNode[], currentPath = '') {
        items.forEach(item => {
            const path = currentPath ? `${currentPath}/${item.name}` : item.name;
            if (item.type === 'file') {
                selection[path] = false;
            } else if (item.type === 'dir' && item.children) {
                if (item.children.length > 0) {
                    expansion[path] = true; 
                }
                traverse(item.children, path);
            }
        });
    }
    traverse(nodes);
    setFileSelection(selection);
    setExpandedFolders(expansion);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    await handleFetchRepo(values.repoPath);
    setRepoUrl(`https://github.com/${values.repoPath}`);
  }

  async function handleGenerateDocs() {
    if (!repoTree) return;
    
    setIsLoading(true);
    setDocumentation(null);
    setLogs([]);
    setIsFetchingContent(true);

    const selectedFilesToFetch: { path: string }[] = [];
    
    function findSelectedFiles(nodes: FileNode[], currentPath = '') {
      nodes.forEach(node => {
        const path = currentPath ? `${currentPath}/${node.name}` : node.name;
        if (node.type === 'file' && fileSelection[path]) {
          selectedFilesToFetch.push({ path });
        } else if (node.type === 'dir' && node.children) {
          findSelectedFiles(node.children, path);
        }
      });
    }

    findSelectedFiles(repoTree);

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
  
  const toggleFolderSelection = (nodes: FileNode[], parentPath: string, isSelected: boolean) => {
    let newSelection = {...fileSelection};
    
    function traverse(items: FileNode[], currentBasePath: string) {
        items.forEach(item => {
            const path = currentBasePath ? `${currentBasePath}/${item.name}` : item.name;
            if (item.type === 'file') {
                newSelection[path] = isSelected;
            } else if (item.type === 'dir' && item.children) {
                traverse(item.children, path);
            }
        });
    }
    
    traverse(nodes, parentPath);
    setFileSelection(newSelection);
  };


  const toggleFolderExpansion = (path: string) => {
    setExpandedFolders(prev => ({...prev, [path]: !prev[path]}));
  };
  
  const getFolderSelectionState = (nodes: FileNode[], parentPath: string): boolean | 'indeterminate' => {
    let hasSelectedFile = false;
    let hasUnselectedFile = false;

    function traverse(items: FileNode[], currentBasePath: string) {
      for (const item of items) {
        if (hasSelectedFile && hasUnselectedFile) break;
        const path = currentBasePath ? `${currentBasePath}/${item.name}` : item.name;
        if (item.type === 'file') {
          if (fileSelection[path]) {
            hasSelectedFile = true;
          } else {
            hasUnselectedFile = true;
          }
        } else if (item.type === 'dir' && item.children) {
          traverse(item.children, path);
        }
      }
    }

    traverse(nodes, parentPath);

    if (hasSelectedFile && hasUnselectedFile) return 'indeterminate';
    if (hasSelectedFile) return true;
    return false;
  };
  
  const toggleAllSelection = (isSelected: boolean) => {
      if (!repoTree) return;
      toggleFolderSelection(repoTree, '', isSelected);
  };
  
  const getRootSelectionState = (): boolean | 'indeterminate' => {
      if (!repoTree) return false;
      return getFolderSelectionState(repoTree, '');
  };

  const FileTreeView = ({ nodes, parentPath = '' }: { nodes: FileNode[], parentPath?: string }) => {
    return (
      <ul className="space-y-1">
        {nodes.map(node => {
          const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
          if (node.type === 'dir') {
            const isExpanded = expandedFolders[currentPath];
            const selectionState = getFolderSelectionState(node.children || [], currentPath);

            return (
              <li key={currentPath}>
                <div className="flex items-center gap-2 py-1">
                    <Checkbox
                        id={`folder-${currentPath}`}
                        checked={selectionState}
                        onCheckedChange={(checked) => toggleFolderSelection(node.children || [], currentPath, !!checked)}
                        aria-label={`Select folder ${node.name}`}
                    />
                    <div 
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => toggleFolderExpansion(currentPath)}
                    >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {isExpanded ? <FolderOpen className="h-5 w-5 text-primary" /> : <Folder className="h-5 w-5 text-primary" />}
                        <label htmlFor={`folder-${currentPath}`} className="font-medium cursor-pointer">{node.name}</label>
                        <CacheStatusIcon path={currentPath} cacheStatus={cacheStatus} />
                    </div>
                </div>
                {isExpanded && node.children && (
                  <div className="pl-6">
                    <FileTreeView nodes={node.children} parentPath={currentPath} />
                  </div>
                )}
              </li>
            );
          }
          return (
            <li key={currentPath} className="flex items-center gap-2 pl-6 py-1">
              <Checkbox
                id={currentPath}
                checked={!!fileSelection[currentPath]}
                onCheckedChange={(checked) => toggleSelection(currentPath, !!checked)}
                aria-label={`Select file ${node.name}`}
              />
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              <label htmlFor={currentPath} className="cursor-pointer">{node.name}</label>
              <CacheStatusIcon path={currentPath} cacheStatus={cacheStatus} />
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

      {repoTree && !isFetchingRepo && (
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
                    <CacheStatusIcon path={form.getValues('repoPath')} cacheStatus={cacheStatus} />
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
