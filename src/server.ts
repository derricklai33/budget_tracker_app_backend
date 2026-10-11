import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const prisma = new PrismaClient();
const app = createApp({ prisma, auth: config.auth });

app.listen(config.port, () => {
  console.log(`Budget tracker API listening on port ${config.port}`);
});
