import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_ID = 'com.youfacetechnologies.youface';
const errors = [];
const warnings = [];
const ok = [];

function pass(message) { ok.push(message); }
function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(ROOT, file)); }

const requiredEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PUBLIC_API_KEY',
  'FIREBASE_PUBLIC_AUTH_DOMAIN',
  'FIREBASE_PUBLIC_APP_ID'
];
for (const key of requiredEnv) {
  if (!String(process.env[key] || '').trim()) fail(`${key} manquant dans .env`);
  else pass(`${key} présent`);
}

const cap = read('capacitor.config.ts');
cap.includes(`appId: '${APP_ID}'`) ? pass(`Capacitor appId = ${APP_ID}`) : fail('Capacitor appId incohérent');
const androidGradle = read('android/app/build.gradle');
androidGradle.includes(`applicationId "${APP_ID}"`) ? pass(`Android applicationId = ${APP_ID}`) : fail('Android applicationId incohérent');
androidGradle.includes(`namespace "${APP_ID}"`) ? pass(`Android namespace = ${APP_ID}`) : fail('Android namespace incohérent');
const mainActivity = `android/app/src/main/java/${APP_ID.replaceAll('.', '/')}/MainActivity.java`;
if (!exists(mainActivity)) fail(`MainActivity absent: ${mainActivity}`);
else if (!read(mainActivity).includes(`package ${APP_ID};`)) fail('Package MainActivity incohérent');
else pass('MainActivity package cohérent');
const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
const bundleMatches = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(match => match[1]);
if (!bundleMatches.length || bundleMatches.some(id => id !== APP_ID)) fail(`Bundle ID iOS incohérent: ${bundleMatches.join(', ') || 'introuvable'}`);
else pass(`iOS bundle ID = ${APP_ID}`);

const androidConfig = 'android/app/google-services.json';
if (!exists(androidConfig)) {
  fail(`${androidConfig} manquant`);
} else {
  try {
    const json = JSON.parse(read(androidConfig));
    const projectId = json.project_info?.project_id || '';
    const packages = (json.client || []).map(client => client.client_info?.android_client_info?.package_name).filter(Boolean);
    if (!packages.includes(APP_ID)) fail(`google-services.json ne contient pas le package ${APP_ID}`);
    else pass('google-services.json correspond au package Android');
    if (process.env.FIREBASE_PROJECT_ID && projectId !== process.env.FIREBASE_PROJECT_ID) fail('FIREBASE_PROJECT_ID ne correspond pas à google-services.json');
    else if (projectId) pass('Project ID Android cohérent');
    const oauthClients = (json.client || []).flatMap(client => client.oauth_client || []);
    if (!oauthClients.some(client => Number(client.client_type) === 3)) {
      warn('Client OAuth Web non détecté dans google-services.json; re-télécharger le fichier après activation de Google Sign-In.');
    }
  } catch (error) {
    fail(`google-services.json invalide: ${error.message}`);
  }
}

const iosConfig = 'ios/App/App/GoogleService-Info.plist';
if (!exists(iosConfig)) {
  warn(`${iosConfig} manquant — Android peut être testé, mais pas l’auth Firebase native iOS.`);
} else {
  const plist = read(iosConfig);
  const bundleMatch = plist.match(/<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/);
  const projectMatch = plist.match(/<key>PROJECT_ID<\/key>\s*<string>([^<]+)<\/string>/);
  if (!bundleMatch || bundleMatch[1] !== APP_ID) fail(`GoogleService-Info.plist BUNDLE_ID doit être ${APP_ID}`);
  else pass('GoogleService-Info.plist correspond au bundle iOS');
  if (projectMatch && process.env.FIREBASE_PROJECT_ID && projectMatch[1] !== process.env.FIREBASE_PROJECT_ID) {
    fail('FIREBASE_PROJECT_ID ne correspond pas au plist iOS');
  }
}

const serviceAccountFile = String(process.env.FIREBASE_SERVICE_ACCOUNT_FILE || '').trim();
const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
if (!serviceAccountFile && !serviceAccountJson) {
  fail('Compte de service Firebase Admin manquant: FIREBASE_SERVICE_ACCOUNT_FILE ou FIREBASE_SERVICE_ACCOUNT_JSON');
} else {
  try {
    const raw = serviceAccountJson || fs.readFileSync(path.resolve(ROOT, serviceAccountFile), 'utf8');
    const account = JSON.parse(raw);
    if (account.type !== 'service_account' || !account.project_id || !account.client_email || !account.private_key) {
      fail('Compte de service Firebase incomplet');
    } else if (process.env.FIREBASE_PROJECT_ID && account.project_id !== process.env.FIREBASE_PROJECT_ID) {
      fail('Le compte de service appartient à un autre projet Firebase');
    } else {
      pass('Compte de service Firebase Admin valide et cohérent');
    }
  } catch (error) {
    fail(`Compte de service Firebase illisible/invalide: ${error.message}`);
  }
}

console.log('\n=== YOUFACE FIREBASE PREFLIGHT 0.4.2 ===');
for (const item of ok) console.log(`PASS  ${item}`);
for (const item of warnings) console.log(`WARN  ${item}`);
for (const item of errors) console.log(`FAIL  ${item}`);
console.log(`\nRésumé: ${ok.length} PASS, ${warnings.length} WARN, ${errors.length} FAIL`);
if (errors.length) process.exit(1);
