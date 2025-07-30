"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Bot, User } from "lucide-react";

type AiInteraction = {
  request: string;
  response: any;
};

type AiInteractionDisplayProps = {
  interactions: AiInteraction[];
};

export function AiInteractionDisplay({ interactions }: AiInteractionDisplayProps) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="font-headline text-2xl flex items-center gap-2">Live AI Interactions</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {interactions.map((interaction, index) => (
            <AccordionItem value={`item-${index}`} key={index}>
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                    <User className="h-4 w-4" /> 
                    Request #{index + 1}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="p-4 bg-muted rounded-md overflow-x-auto">
                    <pre className="whitespace-pre-wrap font-mono text-sm">{interaction.request}</pre>
                </div>
              </AccordionContent>
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" /> 
                    Response #{index + 1}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="p-4 bg-muted rounded-md overflow-x-auto">
                    <pre className="whitespace-pre-wrap font-mono text-sm">{JSON.stringify(interaction.response, null, 2)}</pre>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
