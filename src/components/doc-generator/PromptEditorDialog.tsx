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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type PromptEditorDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  onConfirm: () => void;
  isLoading: boolean;
};

export function PromptEditorDialog({
  isOpen,
  onOpenChange,
  prompt,
  setPrompt,
  onConfirm,
  isLoading,
}: PromptEditorDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Refine Documentation Prompt</DialogTitle>
          <DialogDescription>
            Review and edit the instructions that will be sent to the AI to generate your documentation.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Label htmlFor="prompt-textarea">Additional Instructions</Label>
          <Textarea
            id="prompt-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            placeholder="e.g., Focus on the API endpoints..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Documentation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
