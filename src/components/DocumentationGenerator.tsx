"use client";

import { useDocGenerator } from "@/hooks/useDocGenerator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentationDisplay } from "@/components/DocumentationDisplay";
import { LoadingSkeleton } from "@/components/doc-generator/LoadingSkeleton";
import { RepoInput } from "@/components/doc-generator/RepoInput";
import { RepoList } from "@/components/doc-generator/RepoList";
import { FileTree } from "@/components/doc-generator/FileTree";
import { ActionBar } from "@/components/doc-generator/ActionBar";
import { LogDisplay } from "@/components/doc-generator/LogDisplay";
import { Github } from "lucide-react";
import { ApiSettings } from "./doc-generator/ApiSettings";

export function DocumentationGenerator() {
  const {
    form,
    onAddRepo,
    repoPaths,
    removeRepository,
    isFetchingRepo,
    repoTrees,
    getRootSelectionState,
    toggleAllSelectionForRepo,
    cacheStatus,
    expandedFolders,
    fileSelection,
    getFolderSelectionState,
    toggleFolderSelection,
    toggleFolderExpansion,
    loadedPaths,
    handleGenerateDocs,
    isLoading,
    isFetchingContent,
    availableModels,
    selectedModel,
    setSelectedModel,
    documentation,
    logs,
    generatedRepoUrl,
    logContainerRef,
    toggleSelection,
    fileSizes,
    apiKeys,
    setApiKeys,
    isApiSettingsOpen,
    setIsApiSettingsOpen
  } = useDocGenerator();

  return (
    <>
       <ApiSettings 
        isOpen={isApiSettingsOpen}
        onOpenChange={setIsApiSettingsOpen}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
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
          <RepoInput form={form} onAddRepo={onAddRepo} onSettingsClick={() => setIsApiSettingsOpen(true)} />
          {repoPaths.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-2">Added Repositories</h3>
              <RepoList repoPaths={repoPaths} removeRepository={removeRepository} />
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
            <FileTree 
              repoPaths={repoPaths}
              isFetchingRepo={isFetchingRepo}
              repoTrees={repoTrees}
              getRootSelectionState={getRootSelectionState}
              toggleAllSelectionForRepo={toggleAllSelectionForRepo}
              cacheStatus={cacheStatus}
              expandedFolders={expandedFolders}
              fileSelection={fileSelection}
              getFolderSelectionState={getFolderSelectionState}
              toggleFolderSelection={toggleFolderSelection}
              toggleFolderExpansion={toggleFolderExpansion}
              loadedPaths={loadedPaths}
              toggleSelection={toggleSelection}
              fileSizes={fileSizes}
            />
            <ActionBar 
              handleGenerateDocs={handleGenerateDocs}
              isLoading={isLoading}
              isFetchingContent={isFetchingContent}
              availableModels={availableModels}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
            />
          </CardContent>
        </Card>
      )}

      {(isFetchingContent || isLoading || (logs && logs.length > 0)) && (
        <LogDisplay logs={logs} isLoading={isLoading || isFetchingContent} logContainerRef={logContainerRef} />
      )}

      {isLoading && !documentation && <LoadingSkeleton />}
      {documentation && !isLoading && (
        <DocumentationDisplay documentation={documentation} repoUrl={generatedRepoUrl}/>
      )}
    </>
  );
}
