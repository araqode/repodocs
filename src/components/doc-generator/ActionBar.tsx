"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, Sparkles } from "lucide-react";

type Model = {
    id: string;
    name: string;
};

type ActionBarProps = {
    onGenerateClick: () => void;
    isLoading: boolean;
    isFetchingContent: boolean;
    availableModels: Model[];
    selectedModel: string;
    setSelectedModel: (model: string) => void;
};

export function ActionBar({
    onGenerateClick,
    isLoading,
    isFetchingContent,
    availableModels,
    selectedModel,
    setSelectedModel
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
    );
}
