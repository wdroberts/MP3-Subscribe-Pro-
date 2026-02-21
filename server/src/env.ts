import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn(`⚠ Could not load .env from ${envPath}`);
  console.warn('  Copy .env.example to .env and configure your credentials.');
} else {
  console.log(`[env] Loaded .env from ${envPath}`);
}
