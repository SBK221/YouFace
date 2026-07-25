import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.html', '.json']);
const rules = [
  { name: 'eval()', pattern: /\beval\s*\(/g },
  { name: 'new Function()', pattern: /\bnew\s+Function\s*\(/g },
  { name: 'document.write()', pattern: /document\.write(?:ln)?\s*\(/g },
  { name: 'HTTP endpoint', pattern: /https?:\/\/(?!localhost\b|127\.0\.0\.1\b)[^\s"'`]+/g, allow: /^https:\/\// },
  { name: 'hard-coded secret-like value', pattern: /(?:api[_-]?key|secret|private[_-]?key|access[_-]?token)\s*[:=]\s*["'`][A-Za-z0-9_\-/.+=]{20,}["'`]/gi },
  { name: 'token persisted to localStorage', pattern: /localStorage\.(?:setItem|getItem)\s*\(\s*["'`](?:token|access_token|refresh_token|session)/gi }
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'android', 'ios', '.git', 'tests'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const files = (await walk(ROOT)).filter((file) => {
  if (file.endsWith('scripts/security-check.mjs')) return false;
  if (file.endsWith('public/identity.js') || file.endsWith('public/billing.js')) return false;
  const dot = file.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(file.slice(dot));
});

const findings = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const rule of rules) {
    for (const match of source.matchAll(rule.pattern)) {
      if (rule.allow && rule.allow.test(match[0])) continue;
      const line = source.slice(0, match.index).split('\n').length;
      findings.push(`${relative(ROOT, file)}:${line} — ${rule.name}: ${match[0].slice(0, 120)}`);
    }
  }
}

if (findings.length) {
  console.error('Security check failed:\n' + findings.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Security check passed (${files.length} text files scanned).`);
