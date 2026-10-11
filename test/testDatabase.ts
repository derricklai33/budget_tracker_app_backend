// Tests truncate tables, so they only ever use TEST_DATABASE_URL (never DATABASE_URL).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/budget_tracker_test';
