import 'dotenv/config';
import Stripe from 'stripe';
const key = process.env.STRIPE_SECRET_KEY || '';
if (!key.startsWith('sk_test_')) {
  console.error('STRIPE_SECRET_KEY doit être une clé de test sk_test_... pour le staging.');
  process.exit(1);
}
const stripe = new Stripe(key, { maxNetworkRetries: 2 });
const account = await stripe.accounts.retrieve();
let priceId = process.env.STRIPE_CREATOR_PRICE_ID || '';
if (!priceId) {
  const product = await stripe.products.create({ name: 'YouFace Creator Premium', metadata: { environment: 'staging', managed_by: 'youface-bootstrap' } });
  const price = await stripe.prices.create({ product: product.id, currency: 'eur', unit_amount: 499, recurring: { interval: 'month' } });
  priceId = price.id;
}
console.log(`STRIPE_ACCOUNT=${account.id}`);
console.log(`STRIPE_CREATOR_PRICE_ID=${priceId}`);
console.log('Copiez le price ID dans .env. Aucun secret n’a été écrit dans le code.');
