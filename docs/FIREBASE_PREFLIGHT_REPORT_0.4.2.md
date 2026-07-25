# YouFace Firebase Preflight Report — 0.4.2

## Scope

This report covers the Firebase connection readiness of YouFace after adding three authentication paths:

- Phone number + SMS OTP
- Google Sign-In
- Gmail + password with email verification

## Native application identifier

`com.youfacetechnologies.youface`

Validated consistently in:

- `capacitor.config.ts`
- Android `namespace`
- Android `applicationId`
- Android `MainActivity` package
- iOS `PRODUCT_BUNDLE_IDENTIFIER`

Result: **PASS**.

## Firebase preflight validator

Command:

```bash
npm run firebase:preflight
```

A coherent synthetic Firebase configuration was used to validate the validator itself. No synthetic credential is shipped in the final archive.

Result:

- 13 PASS
- 0 WARN
- 0 FAIL

Checks include:

- required public Firebase Web config values;
- Capacitor/Android/iOS native identifier consistency;
- Android `google-services.json` package name;
- Firebase project ID consistency;
- iOS `GoogleService-Info.plist` bundle ID;
- Firebase Admin service-account structure and project ID.

## Core tests

Command:

```bash
npm test
```

Result:

- Billing/webhook/wallet/tips: PASS
- Phone/Google/Gmail identity + core social + media worker: PASS
- PostgreSQL external integration test: SKIP when external test database is absent
- S3/FFmpeg external integration test: SKIP when external test storage is absent

## Security scanner

Command:

```bash
npm run security:check
```

Result: **PASS — 41 text files scanned**.

## Dependency audit

Command:

```bash
npm audit --audit-level=high
```

No high or critical severity finding blocks the command. npm reports six moderate transitive findings in the Firebase Admin dependency chain. `npm audit fix --force` is deliberately not applied because it proposes a breaking downgrade/change.

## Android SHA fingerprints

Command prepared:

```bash
npm run firebase:fingerprints
```

In the current execution environment, Gradle Wrapper could not download `gradle-8.11.1-all.zip` because `services.gradle.org` was unreachable from that environment (`UnknownHostException`). Therefore SHA-1/SHA-256 were not fabricated or claimed as validated here.

The Windows connector runs this command on the user's development machine. The resulting `FIREBASE_SHA_FINGERPRINTS.txt` must be used to register SHA-1 and SHA-256 in Firebase.

## Real credentials

No Firebase project ID, API key, service-account private key, `google-services.json`, or `GoogleService-Info.plist` has been invented or embedded in the deliverable.

The real connection requires the project owner's Firebase configuration files. The script `05_CONNECTER_FIREBASE.cmd` installs and validates those local files without placing the Firebase Admin service account in Git.
