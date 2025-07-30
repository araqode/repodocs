'use server';

/**
 * @fileOverview Defines the Genkit flow for generating comprehensive project technical documentation.
 *
 * This file contains the core logic for the documentation generation, including the
 * prompt definition and the flow that interacts with the generative AI model.
 * This uses a map-reduce strategy: first summarizing each file, then synthesizing a final document.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// Schema for a single file's summary
const FileSummarySchema = z.object({
  path: z.string(),
  summary: z.string().describe("A summary of the file's purpose, functionality, and key exports."),
});

// Schema for the file summarization prompt input
const SummarizeFileInputSchema = z.object({
  path: z.string(),
  content: z.string(),
});

// Input for the main documentation generation flow
const GenerateDocumentationInputSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).describe('An array of file objects, each with a path and its content.'),
  userPrompt: z.string().optional().describe('Additional user instructions to refine the documentation.'),
  apiKey: z.string().optional().describe('Gemini API key')
});
export type GenerateDocumentationInput = z.infer<typeof GenerateDocumentationInputSchema>;

// Output for the main documentation generation flow
const GenerateDocumentationOutputSchema = z.object({
  documentation: z.string().describe('The generated documentation for the repository.'),
});
export type GenerateDocumentationOutput = z.infer<typeof GenerateDocumentationOutputSchema>;


/**
 * Prompt to summarize a single file.
 */
const summarizeFilePrompt = ai.definePrompt({
  name: 'summarizeFilePrompt',
  input: { schema: SummarizeFileInputSchema },
  output: { schema: FileSummarySchema },
  prompt: `You are an expert technical writer. Analyze the following file and provide a concise summary.

File Path: {{{path}}}
Content:
\'\'\'
{{{content}}}
\'\'\'

Your summary should cover:
- The primary purpose and responsibility of this file.
- Key functions, classes, or components exported.
- Its role within the overall project structure.

Provide only the summary for this single file.
`,
});

/**
 * Prompt to synthesize the final documentation from individual file summaries.
 */
const synthesizeDocumentationPrompt = ai.definePrompt({
  name: 'synthesizeDocumentationPrompt',
  input: {
    schema: z.object({
      summaries: z.array(FileSummarySchema),
      userPrompt: z.string().optional(),
    }),
  },
  output: { schema: GenerateDocumentationOutputSchema },
  prompt: `You are an expert technical writer. You have been provided with summaries for several files from a codebase. Your task is to synthesize these into a single, comprehensive technical document.

The user's overall goal for this documentation is:
{{#if userPrompt}}
{{{userPrompt}}}
{{else}}
Provide a high-level overview of the project, including its purpose and key features. Then, for each file, describe its role and functionality based on the summary. Finally, detail the relationships and interactions between the different files and components.
{{/if}}

Here are the summaries for each file:
{{#each summaries}}
---
File Path: {{{path}}}
Summary:
{{{summary}}}
---
{{/each}}

Please adhere to the following instructions:
- Create a well-structured and comprehensive technical documentation.
- The documentation should include an overview of the project, followed by the detailed descriptions based on the summaries provided.
- **Crucially, analyze and explain the relationships and interactions between the different files.** This is vital for understanding the project's data flow and overall structure.
- Format the final output for readability. Use Markdown for structuring the text (e.g., headings, lists, code blocks).
- Use dashed-underline for inline hrefs/links for documentation to file mapping.
`,
});


/**
 * The main flow for generating documentation.
 */
export const generateDocumentationFlow = ai.defineFlow(
  {
    name: 'generateDocumentationFlow',
    inputSchema: GenerateDocumentationInputSchema,
    outputSchema: GenerateDocumentationOutputSchema,
  },
  async (input) => {
    let plugins = [];
    if (input.apiKey) {
      plugins.push(googleAI({ apiKey: input.apiKey }));
    }

    // Step 1: Summarize each file individually (Map step)
    const summaryPromises = input.files.map(file =>
      summarizeFilePrompt({ path: file.path, content: file.content }, { plugins })
    );

    const summaryResults = await Promise.all(summaryPromises);
    const summaries = summaryResults.map(r => r.output!).filter(Boolean) as z.infer<typeof FileSummarySchema>[];

    // Step 2: Synthesize the final documentation from summaries (Reduce step)
    const finalDocumentationResponse = await synthesizeDocumentationPrompt(
      {
        summaries: summaries,
        userPrompt: input.userPrompt,
      },
      { plugins }
    );
    
    return finalDocumentationResponse.output!;
  }
);
