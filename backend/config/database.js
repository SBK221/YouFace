import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../data');
const POSTS_FILE = join(DATA_DIR, 'posts.json');
const EMAIL_HISTORY_FILE = join(DATA_DIR, 'email-history.json');

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function readPosts() {
  await ensureDataDir();
  if (!existsSync(POSTS_FILE)) {
    await writeFile(POSTS_FILE, '[]');
    return [];
  }
  return JSON.parse(await readFile(POSTS_FILE, 'utf-8'));
}

export async function writePosts(posts) {
  await ensureDataDir();
  await writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
}

export async function readEmailHistory() {
  await ensureDataDir();
  if (!existsSync(EMAIL_HISTORY_FILE)) {
    await writeFile(EMAIL_HISTORY_FILE, '[]');
    return [];
  }
  return JSON.parse(await readFile(EMAIL_HISTORY_FILE, 'utf-8'));
}

export async function appendEmailHistory(entry) {
  const history = await readEmailHistory();
  history.push({ ...entry, sentAt: new Date().toISOString() });
  await writeFile(EMAIL_HISTORY_FILE, JSON.stringify(history, null, 2));
}
