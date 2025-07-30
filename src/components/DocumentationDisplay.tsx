"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, Printer, FileText } from "lucide-react";
import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";


type DocumentationDisplayProps = {
  documentation: string;
  repoUrl: string;
};

const renderContent = (content: string) => {
  return content.split('\n').map((line, lineIndex) => {
    if (line.trim() === '') return <div key={lineIndex} className="h-4" />;

    if (line.startsWith('# ')) return <h1 key={lineIndex} className="font-headline text-3xl font-bold mt-6 mb-2 border-b pb-2">{line.substring(2)}</h1>;
    if (line.startsWith('## ')) return <h2 key={lineIndex} className="font-headline text-2xl font-bold mt-5 mb-2 border-b pb-2">{line.substring(3)}</h2>;
    if (line.startsWith('### ')) return <h3 key={lineIndex} className="font-headline text-xl font-bold mt-4 mb-2">{line.substring(4)}</h3>;
    if (line.trim() === '---' || line.trim() === '***') return <Separator key={lineIndex} className="my-4" />;
    
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const itemContent = line.trim().substring(2);
        const parts = itemContent.split(/(\[.*?\]\(.*?\)|`.*?`|\*\*.*?\*\*)/g);
        return <li key={lineIndex} className="ml-6 list-disc my-1">{parts.map((part, partIndex) => renderInline(part, partIndex))}</li>
    }
    
    const parts = line.split(/(\[.*?\]\(.*?\)|`.*?`|\*\*.*?\*\*)/g);
    return <p key={lineIndex} className="my-2 leading-relaxed">{parts.map((part, partIndex) => renderInline(part, partIndex))}</p>;
  });
};

const renderInline = (part: string, index: number) => {
    if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index} className="font-code bg-muted text-muted-foreground px-1.5 py-1 rounded-sm">{part.slice(1, -1)}</code>;
    }
    const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
    if (linkMatch) {
        return <a key={index} href={linkMatch[2]} target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>;
    }
    return part;
}


export function DocumentationDisplay({ documentation, repoUrl }: DocumentationDisplayProps) {

  const downloadAsMarkdown = () => {
    const blob = new Blob([documentation], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const repoName = repoUrl.split('/').pop() || 'documentation';
    a.download = `${repoName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printDocumentation = () => {
    window.print();
  };

  return (
    <Card className="mt-8 shadow-lg" id="documentation-section">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
                <CardTitle className="font-headline text-2xl">Generated Documentation</CardTitle>
                <CardDescription>
                    For repository: <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{repoUrl}</a>
                </CardDescription>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={downloadAsMarkdown}><Download className="mr-2 h-4 w-4" /> Markdown</Button>
                <Button variant="outline" onClick={printDocumentation}><Printer className="mr-2 h-4 w-4" /> PDF</Button>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <Separator />
        <div className="mt-6 doc-display font-body text-base">
            {renderContent(documentation)}
        </div>
        
        <Separator className="my-8" />
        
        <div>
          <h4 className="font-headline text-lg font-semibold mb-4 text-center">
            Custom Formatting
          </h4>
          <Card className="max-w-md mx-auto bg-muted/50">
            <CardHeader>
              <CardTitle className="text-lg font-headline">Coming Soon!</CardTitle>
              <CardDescription>More options to customize the output will be available here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 opacity-50 pointer-events-none">
              <div className="flex items-center justify-between">
                <Label htmlFor="heading-style">Heading Style</Label>
                <Select defaultValue="default">
                  <SelectTrigger id="heading-style" className="w-[180px] bg-background">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="dark-mode">Dark Mode Code</Label>
                <Switch id="dark-mode" />
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
