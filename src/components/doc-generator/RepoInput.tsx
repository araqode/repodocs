"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const repoFormSchema = z.object({
  repoPath: z.string().min(1, { message: "Please enter a repository path." }).refine(
    (path) => /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/.test(path),
    "Please enter a valid `owner/repo` path."
  ),
});

type RepoInputProps = {
    form: ReturnType<typeof useForm<z.infer<typeof repoFormSchema>>>;
    onAddRepo: (values: z.infer<typeof repoFormSchema>) => void;
};

export function RepoInput({ form, onAddRepo }: RepoInputProps) {
    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onAddRepo)} className="flex flex-col sm:flex-row gap-4">
                <FormField
                    control={form.control}
                    name="repoPath"
                    render={({ field }) => (
                        <FormItem className="flex-grow">
                            <FormLabel className="sr-only">GitHub Repository Path</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. genkit-ai/genkit" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Adding...
                        </>
                    ) : (
                        'Add Repository'
                    )}
                </Button>
            </form>
        </Form>
    );
}
