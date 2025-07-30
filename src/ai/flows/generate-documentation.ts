'use server';

/**
 * @fileOverview Generates comprehensive project technical documentation from a fetched repository's contents.
 *
 * - generateDocumentation - A function that handles the documentation generation process.
 * - GenerateDocumentationInput - The input type for the generateDocumentation function.
 * - GenerateDocumentationOutput - The return type for the generateDocumentation function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { fetchRepoContents } from '../tools/fetch-repo-contents';
import { googleAI } from '@genkit-ai/googleai';

const GenerateDocumentationInputSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).describe('An array of file objects, each with a path and its content.'),
  model: z.string().optional().describe('The model to use for generation.'),
});
export type GenerateDocumentationInput = z.infer<typeof GenerateDocumentationInputSchema>;

const GenerateDocumentationOutputSchema = z.object({
  documentation: z.string().describe('The generated documentation for the repository.'),
});
export type GenerateDocumentationOutput = z.infer<typeof GenerateDocumentationOutputSchema>;

export async function generateDocumentation(input: GenerateDocumentationInput): Promise<GenerateDocumentationOutput> {
  return generateDocumentationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateDocumentationPrompt',
  input: { schema: GenerateDocumentationInputSchema },
  output: { schema: GenerateDocumentationOutputSchema },
  prompt: `You are an expert technical writer. Generate comprehensive documentation for the provided files from a GitHub repository.
The user has selected the following files to be documented:
{{#each files}}
File: {{{path}}}
Content:
\'\'\'
{{{content}}}
\'\'\'

{{/each}}

Ensure the documentation includes project architecture, key components, usage instructions, and any relevant examples. Properly link and map relationships between files and documentation parts for clarity. Format the documentation for readability and include a table of contents.
Use dashed-underline for inline hrefs/links for documentation to file mapping.
`,
});

const generateDocumentationFlow = ai.defineFlow(
  {
    name: 'generateDocumentationFlow',
    inputSchema: GenerateDocumentationInputSchema,
    outputSchema: GenerateDocumentationOutputSchema,
    retry: {
      maxAttempts: 3,
      backoff: {
        duration: 2000,
        factor: 2
      }
    }
  },
  async (input) => {
    const { output } = await prompt(input, { model: input.model ? googleAI.model(input.model) : undefined });
    return output!;
  }
);
