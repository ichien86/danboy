import { existsSync } from 'node:fs';
import { config } from 'dotenv';

/** Muat .env.local lalu .env dari akar repositori. */
for (const f of ['.env.local', '.env']) if (existsSync(f)) config({ path: f });
