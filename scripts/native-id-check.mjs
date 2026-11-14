import fs from 'node:fs';
const APP_ID = 'com.youfacetechnologies.youface';
const checks = [
  ['capacitor.config.ts', `appId: '${APP_ID}'`],
  ['android/app/build.gradle', `namespace "${APP_ID}"`],
  ['android/app/build.gradle', `applicationId "${APP_ID}"`],
  [`android/app/src/main/java/${APP_ID.replaceAll('.', '/')}/MainActivity.java`, `package ${APP_ID};`],
  ['ios/App/App.xcodeproj/project.pbxproj', `PRODUCT_BUNDLE_IDENTIFIER = ${APP_ID};`]
];
let failed = false;
for (const [file, expected] of checks) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(expected)) { console.error(`FAIL ${file}: ${expected}`); failed = true; }
  else console.log(`PASS ${file}`);
}
if (failed) process.exit(1);
console.log(`Native identifiers coherent: ${APP_ID}`);
