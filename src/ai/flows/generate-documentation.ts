// Implemented Genkit flow for generating documentation from a GitHub repository URL.

'use server';

/**
 * @fileOverview Generates comprehensive project technical documentation from a fetched repository's contents.
 *
 * - generateDocumentation - A function that handles the documentation generation process.
 * - GenerateDocumentationInput - The input type for the generateDocumentation function.
 * - GenerateDocumentationOutput - The return type for the generateDocumentation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateDocumentationInputSchema = z.object({
  repoUrl: z
    .string()
    .describe('The URL of the GitHub repository to document.'),
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
  input: {schema: GenerateDocumentationInputSchema},
  output: {schema: GenerateDocumentationOutputSchema},
  prompt: `You are an expert technical writer. Generate comprehensive documentation for the GitHub repository at the following URL: {{{repoUrl}}}.\n\nEnsure the documentation includes project architecture, key components, usage instructions, and any relevant examples. Properly link and map relationships between files and documentation parts for clarity. Format the documentation for readability and include a table of contents.
\nConsider the project's structure, coding conventions, and any README or contributing guidelines available in the repository.\n\nOutput the documentation in a well-formatted manner. Use dashed-underline for inline hrefs/links for documentation to file mapping.
`,
});

const generateDocumentationFlow = ai.defineFlow(
  {
    name: 'generateDocumentationFlow',
    inputSchema: GenerateDocumentationInputSchema,
    outputSchema: GenerateDocumentationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
