"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { generateDocumentation } from "@/ai/flows/generate-documentation";
import { fetchRepoContents, type FileNode } from "@/ai/tools/fetch-repo-contents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { DocumentationDisplay } from "@/components/DocumentationDisplay";
import { Github, Loader2, Wand2, Folder, File as FileIcon, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { Checkbox } from "./ui/checkbox";
import { ScrollArea } from "./ui/scroll-area";

const formSchema = z.object({
  repoPath: z.string().min(1, { message: "Please enter a repository path." }).refine(
    (path) => /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/.test(path),
    "Please enter a valid `owner/repo` path."
  ),
});

type FileSelection = { [path: string]: boolean };

export function DocumentationGenerator() {
  const [documentation, setDocumentation] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingRepo, setIsFetchingRepo] = useState(false);
  const [repoTree, setRepoTree] = useState<FileNode[] | null>(null);
  const [fileSelection, setFileSelection] = useState<FileSelection>({});
  const [expandedFolders, setExpandedFolders] = useState<{[path: string]: boolean}>({});

  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      repoPath: "",
    },
  });

  const getRepoDataFromCache = (path: string) => {
    const cachedData = localStorage.getItem(`repo-cache-${path}`);
    if(cachedData) {
      return JSON.parse(cachedData);
    }
    return null;
  }

  const setRepoDataToCache = (path: string, data: any) => {
    localStorage.setItem(`repo-cache-${path}`, JSON.stringify(data));
  }


  async function handleFetchRepo(path: string) {
    setIsFetchingRepo(true);
    setDocumentation(null);
    setRepoTree(null);

    const cached = getRepoDataFromCache(path);
    if (cached) {
      setRepoTree(cached);
      initializeSelection(cached);
      setIsFetchingRepo(false);
      return;
    }

    try {
      const result = await fetchRepoContents({ repoPath: path });
      setRepoTree(result);
      initializeSelection(result);
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
                selection[path] = true;
            } else if (item.type === 'dir' && item.children) {
                if (item.children.length > 0) {
                    expansion[path] = true; // Expand directories with content by default
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

    const selectedFiles: { path: string, content: string }[] = [];
    
    function findSelectedFiles(nodes: FileNode[], currentPath = '') {
      nodes.forEach(node => {
        const path = currentPath ? `${currentPath}/${node.name}` : node.name;
        if (node.type === 'file' && fileSelection[path] && node.content) {
          selectedFiles.push({ path, content: node.content });
        } else if (node.type === 'dir' && node.children) {
          findSelectedFiles(node.children, path);
        }
      });
    }

    findSelectedFiles(repoTree);

    if(selectedFiles.length === 0) {
        toast({
            variant: "destructive",
            title: "No files selected",
            description: "Please select at least one file to generate documentation.",
        });
        setIsLoading(false);
        return;
    }

    try {
      const result = await generateDocumentation({ files: selectedFiles });
      if (result.documentation) {
        setDocumentation(result.documentation);
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
  
  const toggleFolderExpansion = (path: string) => {
    setExpandedFolders(prev => ({...prev, [path]: !prev[path]}));
  };

  const FileTreeView = ({ nodes, parentPath = '' }: { nodes: FileNode[], parentPath?: string }) => {
    return (
      <ul className="space-y-1">
        {nodes.map(node => {
          const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
          if (node.type === 'dir') {
            const isExpanded = expandedFolders[currentPath];
            return (
              <li key={currentPath}>
                <div 
                  className="flex items-center gap-2 cursor-pointer py-1"
                  onClick={() => toggleFolderExpansion(currentPath)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {isExpanded ? <FolderOpen className="h-5 w-5 text-primary" /> : <Folder className="h-5 w-5 text-primary" />}
                  <span className="font-medium">{node.name}</span>
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
              />
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              <label htmlFor={currentPath} className="cursor-pointer">{node.name}</label>
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
            <ScrollArea className="h-72 w-full rounded-md border p-4">
              <FileTreeView nodes={repoTree} />
            </ScrollArea>
            <Button onClick={handleGenerateDocs} disabled={isLoading} className="mt-4 w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate Docs for Selected Files
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <LoadingSkeleton />}
      {documentation && !isLoading && (
        <DocumentationDisplay documentation={documentation} repoUrl={repoUrl}/>
      )}
    </>
  );
}
