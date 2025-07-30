"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Loader2 } from "lucide-react";
import { RefObject } from "react";

type LogDisplayProps = {
    logs: string[];
    isLoading: boolean;
    logContainerRef: RefObject<HTMLDivElement>;
};

export function LogDisplay({ logs, isLoading, logContainerRef }: LogDisplayProps) {
    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle className="font-headline text-2xl flex items-center gap-2"><Terminal />Logs</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-48 w-full bg-muted rounded-md p-4" ref={logContainerRef}>
                    {logs.map((log, index) => (
                        <p key={index} className="text-sm font-mono whitespace-pre-wrap">{`> ${log}`}</p>
                    ))}
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
