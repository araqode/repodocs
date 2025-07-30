"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronDown, FolderOpen, Folder, File as FileIcon } from "lucide-react";
import { FileNode } from "@/ai/tools/fetch-repo-contents";
import { CacheStatusIcon } from "./CacheStatusIcon";
import { formatFileSize } from "@/lib/utils";

type RepoState<T> = { [repoPath: string]: T };
type FileSelection = { [path: string]: boolean };
type RepoFileSelection = { [repoPath: string]: FileSelection };

type InnerFileTreeViewProps = {
    nodes: FileNode[];
    repoPath: string;
    expandedFolders: RepoState<{ [path: string]: boolean }>;
    fileSelection: RepoFileSelection;
    getFolderSelectionState: (repoPath: string, nodes?: FileNode[]) => boolean | 'indeterminate';
    toggleFolderSelection: (repoPath: string, nodes: FileNode[], isSelected: boolean) => void;
    toggleFolderExpansion: (repoPath: string, node: FileNode) => void;
    loadedPaths: RepoState<{ [path: string]: boolean }>;
    cacheStatus: RepoState<{ [path: string]: boolean }>;
    toggleSelection: (repoPath: string, path: string, isSelected: boolean) => void;
    fileSizes: RepoState<{ [path: string]: number }>;
};

export const InnerFileTreeView = ({ 
    nodes, 
    repoPath,
    expandedFolders,
    fileSelection,
    getFolderSelectionState,
    toggleFolderSelection,
    toggleFolderExpansion,
    loadedPaths,
    cacheStatus,
    toggleSelection,
    fileSizes
}: InnerFileTreeViewProps) => {
    const currentExpanded = expandedFolders[repoPath] || {};
    const currentCacheStatus = cacheStatus[repoPath] || {};
    const currentLoadedPaths = loadedPaths[repoPath] || {};
    const currentSelection = fileSelection[repoPath] || {};
    const currentFileSizes = fileSizes[repoPath] || {};

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
                                    <InnerFileTreeView nodes={node.children} repoPath={repoPath} expandedFolders={expandedFolders} fileSelection={fileSelection} getFolderSelectionState={getFolderSelectionState} toggleFolderSelection={toggleFolderSelection} toggleFolderExpansion={toggleFolderExpansion} loadedPaths={loadedPaths} cacheStatus={cacheStatus} toggleSelection={toggleSelection} fileSizes={fileSizes} />
                                </div>
                            )}
                            {isExpanded && !node.children?.length && currentLoadedPaths[node.path] && (
                                <div className="pl-12 text-muted-foreground italic text-sm">empty</div>
                            )}
                        </li>
                    );
                }
                const fileSize = currentFileSizes[node.path];
                return (
                    <li key={node.path} className="flex items-center gap-2 pl-6 py-1">
                        <Checkbox
                            id={`${repoPath}-${node.path}`}
                            checked={!!currentSelection[node.path]}
                            onCheckedChange={(checked) => toggleSelection(repoPath, node.path, !!checked)}
                            aria-label={`Select file ${node.name}`}
                        />
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                        <label htmlFor={`${repoPath}-${node.path}`} className="cursor-pointer flex-grow">{node.name}</label>
                        {fileSize !== undefined && (
                            <span className="text-xs text-muted-foreground font-mono">{formatFileSize(fileSize)}</span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};
