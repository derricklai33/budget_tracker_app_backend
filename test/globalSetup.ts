import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './testDatabase';

// Creates/syncs the throwaway test database from prisma/schema.prisma (identical to db/schema.rb).
export default function globalSetup() {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
