"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type RepoListProps = {
    repoPaths: string[];
    removeRepository: (repoPath: string) => void;
};

export function RepoList({ repoPaths, removeRepository }: RepoListProps) {
    return (
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
    );
}
