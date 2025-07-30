"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { KeyRound, Github } from "lucide-react";

type ApiKeys = {
    gemini: string;
    github: string;
};

type ApiSettingsProps = {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    apiKeys: ApiKeys,
    setApiKeys: (keys: ApiKeys) => void;
};

export function ApiSettings({ isOpen, onOpenChange, apiKeys, setApiKeys }: ApiSettingsProps) {
    const [currentKeys, setCurrentKeys] = useState(apiKeys);

    useEffect(() => {
        setCurrentKeys(apiKeys);
    }, [apiKeys]);
    
    const handleSave = () => {
        setApiKeys(currentKeys);
        onOpenChange(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>API Keys</DialogTitle>
                    <DialogDescription>
                        Provide your API keys to access services. Your keys are stored only in your browser's local storage and are not shared.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="gemini-key" className="text-right flex items-center justify-end gap-2">
                            <KeyRound className="h-4 w-4" />
                            Gemini
                        </Label>
                        <Input
                            id="gemini-key"
                            type="password"
                            value={currentKeys.gemini}
                            onChange={(e) => setCurrentKeys({...currentKeys, gemini: e.target.value})}
                            className="col-span-3"
                            placeholder="Enter your Gemini API Key"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="github-key" className="text-right flex items-center justify-end gap-2">
                             <Github className="h-4 w-4" />
                            GitHub
                        </Label>
                        <Input
                            id="github-key"
                            type="password"
                            value={currentKeys.github}
                            onChange={(e) => setCurrentKeys({...currentKeys, github: e.target.value})}
                            className="col-span-3"
                            placeholder="Enter your GitHub Personal Access Token"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
