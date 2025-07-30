import { config } from 'dotenv';
config();

import '@/ai/flows/generate-documentation.ts';
import '@/ai/tools/fetch-repo-contents.ts';
