import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, RecaptchaVerifier, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, signInWithPhoneNumber, signOut as webSignOut } from 'firebase/auth';

const config = window.YOUFACE_CONFIG || {};
const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
let webAuth = null;
let webConfirmation = null;
let nativeVerificationId = null;
let nativeListenersReady = false;
let nativePhoneResolve = null;
let nativePhoneReject = null;

function firebaseReady() {
  const firebase = config.firebase || {};
  return Boolean(firebase.apiKey && firebase.projectId && firebase.appId);
}

function ensureWebAuth() {
  if (!firebaseReady()) throw new Error('FIREBASE_PUBLIC_CONFIG_MISSING');
  if (!webAuth) {
    const firebaseApp = getApps().length ? getApps()[0] : initializeApp(config.firebase);
    webAuth = getAuth(firebaseApp);
    webAuth.useDeviceLanguage();
  }
  return webAuth;
}

async function ensureNativeListeners() {
  if (nativeListenersReady) return;
  nativeListenersReady = true;
  await FirebaseAuthentication.addListener('phoneCodeSent', event => {
    nativeVerificationId = event.verificationId;
    nativePhoneResolve?.({ codeSent: true });
    nativePhoneResolve = null; nativePhoneReject = null;
  });
  await FirebaseAuthentication.addListener('phoneVerificationCompleted', async () => {
    try {
      const token = await getIdToken();
      nativePhoneResolve?.({ completed: true, idToken: token });
    } catch (error) { nativePhoneReject?.(error); }
    finally { nativePhoneResolve = null; nativePhoneReject = null; }
  });
  await FirebaseAuthentication.addListener('phoneVerificationFailed', event => {
    nativePhoneReject?.(new Error(event.message || 'PHONE_VERIFICATION_FAILED'));
    nativePhoneResolve = null; nativePhoneReject = null;
  });
}


function normalizeGmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/.test(value)) throw new Error('GMAIL_ADDRESS_REQUIRED');
  return value;
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8 || value.length > 128) throw new Error('PASSWORD_LENGTH_INVALID');
  return value;
}

async function signUpGmail(email, password) {
  const normalizedEmail = normalizeGmail(email);
  const safePassword = validatePassword(password);
  if (isNative) {
    await FirebaseAuthentication.createUserWithEmailAndPassword({ email: normalizedEmail, password: safePassword });
    await FirebaseAuthentication.sendEmailVerification();
    await FirebaseAuthentication.signOut();
    return { verificationRequired: true };
  }
  const result = await createUserWithEmailAndPassword(ensureWebAuth(), normalizedEmail, safePassword);
  await sendEmailVerification(result.user);
  await webSignOut(ensureWebAuth());
  return { verificationRequired: true };
}

async function signInGmail(email, password) {
  const normalizedEmail = normalizeGmail(email);
  const safePassword = validatePassword(password);
  if (isNative) {
    await FirebaseAuthentication.signInWithEmailAndPassword({ email: normalizedEmail, password: safePassword });
    return getIdToken();
  }
  const result = await signInWithEmailAndPassword(ensureWebAuth(), normalizedEmail, safePassword);
  return result.user.getIdToken(true);
}

async function signInGoogle() {
  if (platform === 'ios' && !config.iosGoogleAuthEnabled) throw new Error('GOOGLE_DISABLED_ON_IOS_STORE_BUILD');
  if (isNative) {
    await FirebaseAuthentication.signInWithGoogle();
    return getIdToken();
  }
  const auth = ensureWebAuth();
  await signInWithPopup(auth, new GoogleAuthProvider());
  return auth.currentUser.getIdToken(true);
}

async function startPhone(phoneNumber) {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new Error('PHONE_E164_REQUIRED');
  if (isNative) {
    await ensureNativeListeners();
    return new Promise(async (resolve, reject) => {
      nativePhoneResolve = resolve; nativePhoneReject = reject;
      try { await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber }); }
      catch (error) { nativePhoneResolve = null; nativePhoneReject = null; reject(error); }
    });
  }
  const auth = ensureWebAuth();
  const container = document.getElementById('firebase-recaptcha');
  if (!container) throw new Error('RECAPTCHA_CONTAINER_MISSING');
  container.replaceChildren();
  const verifier = new RecaptchaVerifier(auth, container, { size: 'normal' });
  webConfirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
  return { codeSent: true };
}

async function confirmPhone(code) {
  if (!/^\d{4,8}$/.test(String(code))) throw new Error('OTP_INVALID_FORMAT');
  if (isNative) {
    if (!nativeVerificationId) throw new Error('PHONE_VERIFICATION_NOT_STARTED');
    await FirebaseAuthentication.confirmVerificationCode({ verificationId: nativeVerificationId, verificationCode: String(code) });
    nativeVerificationId = null;
    return getIdToken();
  }
  if (!webConfirmation) throw new Error('PHONE_VERIFICATION_NOT_STARTED');
  const result = await webConfirmation.confirm(String(code));
  webConfirmation = null;
  return result.user.getIdToken(true);
}

async function getIdToken() {
  if (isNative) {
    const result = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
    return result.token || null;
  }
  if (!firebaseReady()) return null;
  const auth = ensureWebAuth();
  return auth.currentUser ? auth.currentUser.getIdToken(false) : null;
}

async function signOut() {
  if (isNative) return FirebaseAuthentication.signOut();
  if (firebaseReady()) return webSignOut(ensureWebAuth());
}

window.YouFaceIdentity = Object.freeze({
  isNative, platform,
  googleEnabled: platform !== 'ios' || Boolean(config.iosGoogleAuthEnabled),
  configured: firebaseReady(), signInGoogle, signUpGmail, signInGmail, startPhone, confirmPhone, getIdToken, signOut
});
