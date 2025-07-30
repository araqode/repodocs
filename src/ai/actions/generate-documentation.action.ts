'use server';

/**
 * @fileOverview This file contains the server action for generating documentation.
 * It acts as the bridge between the client-side application and the backend Genkit flow.
 */

import { generateDocumentationFlow } from '@/ai/flows/generate-documentation.flow';
import type { GenerateDocumentationInput, GenerateDocumentationOutput } from '@/ai/flows/generate-documentation.flow';

export type { GenerateDocumentationInput, GenerateDocumentationOutput };

/**
 * Executes the documentation generation flow.
 *
 * This function is a server action that can be called directly from client components.
 * It takes the file contents and an optional user prompt, and invokes the
 * underlying Genkit flow to produce the technical documentation.
 *
 * @param {GenerateDocumentationInput} input - The input for the documentation generation flow.
 * @returns {Promise<GenerateDocumentationOutput>} The generated documentation.
 */
export async function generateDocumentation(input: GenerateDocumentationInput): Promise<GenerateDocumentationOutput> {
  return generateDocumentationFlow(input);
}
