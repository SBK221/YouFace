import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.error('AndroidManifest.xml introuvable. Lancez d’abord: npx cap add android');
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');
xml = xml.replace(/android:allowBackup="true"/g, 'android:allowBackup="false"');
if (!xml.includes('android:usesCleartextTraffic=')) {
  xml = xml.replace('android:theme="@style/AppTheme">', 'android:theme="@style/AppTheme"\n        android:usesCleartextTraffic="false">');
}
fs.writeFileSync(manifestPath, xml, 'utf8');

const verified = fs.readFileSync(manifestPath, 'utf8');
const checks = [
  ['allowBackup=false', verified.includes('android:allowBackup="false"')],
  ['usesCleartextTraffic=false', verified.includes('android:usesCleartextTraffic="false"')],
  ['only INTERNET permission', !/(CAMERA|RECORD_AUDIO|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|ACCESS_FINE_LOCATION)/.test(verified)],
];

for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
