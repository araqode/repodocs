"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";

type ActionBarProps = {
    onGenerateClick: () => void;
    isLoading: boolean;
    isFetchingContent: boolean;
};

export function ActionBar({
    onGenerateClick,
    isLoading,
    isFetchingContent,
}: ActionBarProps) {
    return (
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
            <Button onClick={onGenerateClick} disabled={isLoading || isFetchingContent} className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
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
        </div>
    );
}
