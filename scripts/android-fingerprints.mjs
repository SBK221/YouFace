import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const gradle = isWindows ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradle, ['signingReport'], {
  cwd: path.resolve('android'),
  encoding: 'utf8',
  shell: isWindows,
  timeout: 180000
});
const output = `${result.stdout || ''}\n${result.stderr || ''}`;
const fingerprints = [...output.matchAll(/(SHA1|SHA-256):\s*([A-F0-9:]+)/g)].map(match => `${match[1]}: ${match[2]}`);
const unique = [...new Set(fingerprints)];
if (result.status !== 0 || unique.length === 0) {
  console.error(output.trim());
  console.error('\nImpossible de lire les empreintes Android. Vérifiez JDK 21 et Android Studio/SDK.');
  process.exit(1);
}
const report = [
  'YOUFACE FIREBASE SHA FINGERPRINTS',
  'Package: com.youfacetechnologies.youface',
  '',
  ...unique,
  '',
  'Ajoutez SHA-1 et SHA-256 dans Firebase Console > Project settings > Your apps > Android.'
].join('\n');
fs.writeFileSync('FIREBASE_SHA_FINGERPRINTS.txt', `${report}\n`);
console.log(report);
console.log('\nRapport écrit: FIREBASE_SHA_FINGERPRINTS.txt');
