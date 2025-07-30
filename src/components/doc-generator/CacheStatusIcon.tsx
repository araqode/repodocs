"use client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Database, Cloud } from "lucide-react";

export const CacheStatusIcon = ({ isLoadedFromCache }: { isLoadedFromCache?: boolean }) => {
    if (isLoadedFromCache === undefined) return null;

    return (
        <Tooltip>
            <TooltipTrigger>
                {isLoadedFromCache
                    ? <Database className="h-4 w-4 text-muted-foreground" />
                    : <Cloud className="h-4 w-4 text-muted-foreground" />
                }
            </TooltipTrigger>
            <TooltipContent>
                <p>{isLoadedFromCache ? 'Loaded from cache' : 'Fetched from API'}</p>
            </TooltipContent>
        </Tooltip>
    )
};
