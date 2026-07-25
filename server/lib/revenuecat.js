import { createHmac, timingSafeEqual } from 'node:crypto';

function constantEqualHex(left, right) {
  if (!/^[a-f0-9]+$/i.test(left || '') || !/^[a-f0-9]+$/i.test(right || '')) return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyRevenueCatSignature(rawBody, header, secret, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!rawBody || !header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(',').map(part => {
    const index = part.indexOf('=');
    return index > 0 ? [part.slice(0, index), part.slice(index + 1)] : ['', ''];
  }));
  if (!parts.t || !parts.v1 || !/^\d+$/.test(parts.t)) return false;
  const timestamp = Number(parts.t);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const computed = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${parts.t}.`), payload]))
    .digest('hex');
  return constantEqualHex(computed, parts.v1);
}
