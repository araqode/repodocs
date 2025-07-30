import { config } from 'dotenv';
config();

import '@/ai/flows/generate-documentation.flow.ts';
import '@/ai/tools/fetch-repo-contents.ts';
