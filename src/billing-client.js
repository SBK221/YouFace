import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

const config = window.YOUFACE_CONFIG || {};
const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
let configured = false;
let currentUserId = null;
const apiKey = () => platform === 'ios' ? config.revenueCatAppleApiKey : config.revenueCatGoogleApiKey;

async function configure(userId) {
  if (!isNative) return { configured: false, reason: 'WEB_STRIPE_PATH' };
  const key = apiKey();
  if (!key) return { configured: false, reason: 'REVENUECAT_PUBLIC_KEY_MISSING' };
  if (!configured) {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey: key, appUserID: userId });
    configured = true; currentUserId = userId;
  } else if (currentUserId !== userId) {
    await Purchases.logIn({ appUserID: userId });
    currentUserId = userId;
  }
  return { configured: true };
}

async function purchaseCredits(userId, productId) {
  const status = await configure(userId);
  if (!status.configured) throw new Error(status.reason);
  const offerings = await Purchases.getOfferings();
  const packages = Object.values(offerings.all || {}).flatMap(offering => offering.availablePackages || []);
  const selected = packages.find(item => item.product?.identifier === productId);
  if (!selected) throw new Error('STORE_PRODUCT_NOT_FOUND');
  return Purchases.purchasePackage({ aPackage: selected });
}

async function restore(userId) {
  const status = await configure(userId);
  if (!status.configured) throw new Error(status.reason);
  return Purchases.restorePurchases();
}

window.YouFaceBilling = Object.freeze({ isNative, platform, configure, purchaseCredits, restore });
