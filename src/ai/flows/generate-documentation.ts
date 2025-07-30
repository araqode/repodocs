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
import { googleAI } from '@genkit-ai/googleai';

const GenerateDocumentationInputSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).describe('An array of file objects, each with a path and its content.'),
  userPrompt: z.string().optional().describe('Additional user instructions to refine the documentation.'),
  apiKey: z.string().optional().describe('Gemini API key')
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

The user has provided the following files and structure for documentation:
{{#each files}}
---
File Path: {{{path}}}
Content:
\'\'\'
{{{content}}}
\'\'\'
---
{{/each}}

Please adhere to the following instructions:
- Analyze the provided files to understand the project architecture, key components, and their functionalities.
- Create a well-structured and comprehensive technical documentation.
- The documentation should include an overview of the project, detailed descriptions of each component/file, usage instructions, and relevant examples where applicable.
- Ensure you accurately map and explain the relationships and interactions between different files and components. This is crucial for understanding the project's data flow and overall structure.
- Format the final output for readability. Use Markdown for structuring the text (e.g., headings, lists, code blocks).
- Use dashed-underline for inline hrefs/links for documentation to file mapping.

{{#if userPrompt}}
The user has provided these additional instructions:
{{{userPrompt}}}
{{/if}}
`,
});

const generateDocumentationFlow = ai.defineFlow(
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
    
    const { output } = await prompt(input, { plugins });
    return output!;
  }
);
