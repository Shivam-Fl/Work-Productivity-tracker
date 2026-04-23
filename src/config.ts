import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? './work-tracker.db',
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? 'UTC',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  shiftCron: process.env.SHIFT_CRON ?? '0 18 * * 1-5',
  maxRetries: Number(process.env.MAX_RETRIES ?? 3),
  githubApiBaseUrl: process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com'
};
