"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FolderGit2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FileNode } from "@/ai/tools/fetch-repo-contents";
import { CacheStatusIcon } from "./CacheStatusIcon";
import { InnerFileTreeView } from "./InnerFileTreeView";

type RepoState<T> = { [repoPath: string]: T };
type FileSelection = { [path: string]: boolean };
type RepoFileSelection = { [repoPath: string]: FileSelection };
type RepoTree = { [repoPath: string]: FileNode[] };

type FileTreeProps = {
    repoPaths: string[];
    isFetchingRepo: RepoState<boolean>;
    repoTrees: RepoTree;
    getRootSelectionState: (repoPath: string) => boolean | 'indeterminate';
    toggleAllSelectionForRepo: (repoPath: string, isSelected: boolean) => void;
    cacheStatus: RepoState<{ [path: string]: boolean }>;
    expandedFolders: RepoState<{ [path: string]: boolean }>;
    fileSelection: RepoFileSelection;
    getFolderSelectionState: (repoPath: string, nodes?: FileNode[]) => boolean | 'indeterminate';
    toggleFolderSelection: (repoPath: string, nodes: FileNode[], isSelected: boolean) => void;
    toggleFolderExpansion: (repoPath: string, node: FileNode) => void;
    loadedPaths: RepoState<{ [path: string]: boolean }>;
    toggleSelection: (repoPath: string, path: string, isSelected: boolean) => void;
    fileSizes: RepoState<{ [path: string]: number }>;
};

export function FileTree({
    repoPaths,
    isFetchingRepo,
    repoTrees,
    getRootSelectionState,
    toggleAllSelectionForRepo,
    cacheStatus,
    toggleSelection,
    fileSizes,
    ...rest
}: FileTreeProps) {
    return (
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
                                    {repoTrees[repoPath] && <InnerFileTreeView nodes={repoTrees[repoPath]} repoPath={repoPath} cacheStatus={cacheStatus} toggleSelection={toggleSelection} fileSizes={fileSizes} {...rest} />}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </ScrollArea>
        </TooltipProvider>
    );
}
