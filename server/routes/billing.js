import { sha256, newId, safeEqual } from '../lib/security.js';
import { withTransaction } from '../db.js';
import { verifyRevenueCatSignature } from '../lib/revenuecat.js';

const isNativeClient = request => request.headers['x-youface-client'] === 'native';

// True only when the event actually concerns this entitlement. Guards the
// entitlement upsert so unrelated events (credit-pack purchases, transfers,
// product changes) never overwrite a still-valid premium row with "inactive".
function eventTargetsEntitlement(event, entitlement) {
  const ids = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [];
  return ids.includes(entitlement);
}

export async function billingRoutes(app, ctx) {
  const { pool, auth, config, stripe } = ctx;

  const requireStripe = (_request, reply, done) => {
    if (!stripe) return reply.code(503).send({ error: 'BILLING_NOT_CONFIGURED' });
    done();
  };

  app.get('/api/billing/readiness', { preHandler: auth.requireAuth }, async request => {
    const native = isNativeClient(request);
    const storeKey = request.headers['x-youface-platform'] === 'ios' ? config.revenueCatAppleApiKey : config.revenueCatGoogleApiKey;
    const reasons = [];
    if (!native && !stripe) reasons.push('STRIPE_SECRET_KEY_MISSING');
    if (native && !storeKey) reasons.push('REVENUECAT_PUBLIC_KEY_MISSING');
    if (!config.revenueCatWebhookAuthorization || !config.revenueCatWebhookHmacSecret) reasons.push('REVENUECAT_WEBHOOK_SECURITY_NOT_CONFIGURED');
    return {
      platform: native ? 'native' : 'web',
      webStripeConfigured: Boolean(stripe),
      connectConfigured: Boolean(stripe),
      revenueCatConfigured: Boolean(storeKey),
      storeBillingConfigured: Boolean(storeKey && config.revenueCatWebhookAuthorization && config.revenueCatWebhookHmacSecret),
      payoutReady: Boolean(stripe && request.auth.stripe_account_id),
      blockingReasons: reasons
    };
  });

  app.get('/api/billing/wallet', { preHandler: auth.requireAuth }, async request => {
    const result = await pool.query('SELECT credits FROM wallet_balances WHERE user_id=$1', [request.auth.id]);
    return { credits: Number(result.rows[0]?.credits || 0) };
  });

  app.post('/api/billing/creators/:creatorId/tip', {
    preHandler: [auth.requireAuth, auth.requireCsrf],
    schema: {
      params: { type: 'object', required: ['creatorId'], properties: { creatorId: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', additionalProperties: false, required: ['credits'], properties: { credits: { type: 'integer', minimum: 1, maximum: 1000000 } } }
    }
  }, async (request, reply) => {
    if (request.params.creatorId === request.auth.id) return reply.code(400).send({ error: 'CANNOT_TIP_SELF' });
    const creator = await pool.query("SELECT id FROM users WHERE id=$1 AND status='active'", [request.params.creatorId]);
    if (!creator.rowCount) return reply.code(404).send({ error: 'CREATOR_NOT_FOUND' });
    const credits = Number(request.body.credits);
    const fee = Math.floor(credits * Math.max(0, Math.min(100, config.tipPlatformFeePercent)) / 100);
    const creatorCredits = credits - fee;
    const tipId = newId();
    const tipTransaction = await withTransaction(pool, async client => {
      let balance = await client.query('SELECT credits FROM wallet_balances WHERE user_id=$1 FOR UPDATE', [request.auth.id]);
      if (!balance.rowCount) {
        await client.query('INSERT INTO wallet_balances(user_id,credits) VALUES($1,0)', [request.auth.id]);
        balance = { rows: [{ credits: 0 }], rowCount: 1 };
      }
      if (Number(balance.rows[0].credits) < credits) return { insufficientCredits: true };
      await client.query('UPDATE wallet_balances SET credits=credits-CAST($2 AS bigint),updated_at=CURRENT_TIMESTAMP WHERE user_id=$1', [request.auth.id, credits]);
      await client.query(
        `INSERT INTO credit_ledger(id,user_id,direction,credits,source,external_reference,metadata)
         VALUES($1,$2,'debit',$3,'creator_tip',$4,$5::jsonb)`,
        [newId(), request.auth.id, credits, tipId, JSON.stringify({ creatorId: request.params.creatorId })]
      );
      await client.query(
        `INSERT INTO creator_tips(id,sender_id,creator_id,credits,creator_credits,platform_fee_credits)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [tipId, request.auth.id, request.params.creatorId, credits, creatorCredits, fee]
      );
      await client.query(
        `INSERT INTO creator_earnings(id,creator_id,source,external_reference,currency,gross_amount,platform_fee,net_amount,status)
         VALUES($1,$2,'creator_tip',$3,'YFC',$4,$5,$6,'recorded')`,
        [newId(), request.params.creatorId, tipId, credits, fee, creatorCredits]
      );
      return { insufficientCredits: false };
    });
    if (tipTransaction?.insufficientCredits) return reply.code(409).send({ error: 'INSUFFICIENT_CREDITS' });
    return reply.code(201).send({ id: tipId, credits, creatorCredits, platformFeeCredits: fee });
  });

  app.post('/api/billing/connect/onboard', { preHandler: [auth.requireAuth, auth.requireCsrf, requireStripe] }, async request => {
    let accountId = request.auth.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express', country: config.stripeConnectCountryDefault,
        ...(request.auth.email ? { email: request.auth.email } : {}),
        capabilities: { transfers: { requested: true } }, metadata: { youface_user_id: request.auth.id }
      });
      accountId = account.id;
      await pool.query('UPDATE users SET stripe_account_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [request.auth.id, accountId]);
    }
    const link = await stripe.accountLinks.create({ account: accountId, refresh_url: config.connectRefreshUrl, return_url: config.connectReturnUrl, type: 'account_onboarding' });
    return { url: link.url };
  });

  app.post('/api/billing/creators/:creatorId/subscribe', {
    preHandler: [auth.requireAuth, auth.requireCsrf, requireStripe],
    schema: { params: { type: 'object', required: ['creatorId'], properties: { creatorId: { type: 'string', format: 'uuid' } } } }
  }, async (request, reply) => {
    if (isNativeClient(request)) return reply.code(409).send({ error: 'NATIVE_STORE_BILLING_REQUIRED' });
    if (!config.stripeCreatorPriceId) return reply.code(503).send({ error: 'CREATOR_PRICE_NOT_CONFIGURED' });
    if (request.params.creatorId === request.auth.id) return reply.code(400).send({ error: 'CANNOT_SUBSCRIBE_SELF' });
    const creator = await pool.query("SELECT id,stripe_account_id FROM users WHERE id=$1 AND status='active'", [request.params.creatorId]);
    if (!creator.rowCount || !creator.rows[0].stripe_account_id) return reply.code(409).send({ error: 'CREATOR_NOT_PAYMENT_READY' });
    let customerId = request.auth.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ ...(request.auth.email ? { email: request.auth.email } : {}), metadata: { youface_user_id: request.auth.id } });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [request.auth.id, customerId]);
    }
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId,
      line_items: [{ price: config.stripeCreatorPriceId, quantity: 1 }],
      success_url: config.billingSuccessUrl, cancel_url: config.billingCancelUrl,
      subscription_data: {
        transfer_data: { destination: creator.rows[0].stripe_account_id },
        application_fee_percent: config.stripeApplicationFeePercent,
        metadata: { youface_subscriber_id: request.auth.id, youface_creator_id: request.params.creatorId }
      },
      metadata: { youface_subscriber_id: request.auth.id, youface_creator_id: request.params.creatorId }
    });
    await pool.query(
      `INSERT INTO paid_subscriptions(id,subscriber_id,creator_id,status) VALUES($1,$2,$3,'pending')
       ON CONFLICT(subscriber_id,creator_id) DO UPDATE SET status='pending',updated_at=CURRENT_TIMESTAMP`,
      [newId(), request.auth.id, request.params.creatorId]
    );
    return { url: checkout.url };
  });

  app.post('/api/billing/webhook', { config: { rawBody: true } }, async (request, reply) => {
    if (!stripe || !config.stripeWebhookSecret) return reply.code(503).send({ error: 'BILLING_NOT_CONFIGURED' });
    const signature = request.headers['stripe-signature'];
    let event;
    try { event = stripe.webhooks.constructEvent(request.rawBody, signature, config.stripeWebhookSecret); }
    catch (error) { return reply.code(400).send({ error: 'WEBHOOK_SIGNATURE_INVALID', message: error.message }); }
    const prior = await pool.query('SELECT processed_at FROM stripe_events WHERE event_id=$1', [event.id]);
    if (prior.rowCount && prior.rows[0].processed_at) return { received: true, duplicate: true };
    if (!prior.rowCount) {
      // Atomic claim: a concurrent duplicate delivery loses the race and is treated as a duplicate
      // instead of throwing a primary-key violation (which would surface as a spurious 500).
      const claim = await pool.query(
        'INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id',
        [event.id, event.type]
      );
      if (!claim.rowCount) return { received: true, duplicate: true };
    }
    try {
      if (event.type.startsWith('customer.subscription.')) {
        const subscription = event.data.object;
        const subscriberId = subscription.metadata?.youface_subscriber_id;
        const creatorId = subscription.metadata?.youface_creator_id;
        if (subscriberId && creatorId) {
          const periodEnd = subscription.items?.data?.[0]?.current_period_end ? new Date(subscription.items.data[0].current_period_end * 1000) : null;
          await pool.query(
            `INSERT INTO paid_subscriptions(id,subscriber_id,creator_id,stripe_subscription_id,status,current_period_end)
             VALUES($1,$2,$3,$4,$5,$6)
             ON CONFLICT(subscriber_id,creator_id) DO UPDATE SET stripe_subscription_id=EXCLUDED.stripe_subscription_id,status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end,updated_at=CURRENT_TIMESTAMP`,
            [newId(), subscriberId, creatorId, subscription.id, subscription.status, periodEnd]
          );
        }
      }
      if (event.type === 'invoice.paid') {
        const invoice = event.data.object;
        const subscriptionId = invoice.parent?.subscription_details?.subscription || invoice.subscription || null;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const creatorId = subscription.metadata?.youface_creator_id;
          if (creatorId) {
            const gross = Number(invoice.amount_paid || 0);
            const fee = Math.round(gross * (config.stripeApplicationFeePercent / 100));
            await pool.query(
              `INSERT INTO creator_earnings(id,creator_id,source,external_reference,currency,gross_amount,platform_fee,net_amount,status)
               VALUES($1,$2,'stripe_invoice',$3,$4,$5,$6,$7,'recorded') ON CONFLICT(source,external_reference) DO NOTHING`,
              [newId(), creatorId, invoice.id, invoice.currency || 'eur', gross, fee, gross - fee]
            );
          }
        }
      }
      await pool.query('UPDATE stripe_events SET processed_at=CURRENT_TIMESTAMP WHERE event_id=$1', [event.id]);
      return { received: true };
    } catch (error) {
      request.log.error({ err: error, eventId: event.id, eventType: event.type }, 'stripe webhook processing failed');
      throw error;
    }
  });

  app.post('/api/billing/revenuecat/webhook', { config: { rawBody: true } }, async (request, reply) => {
    if (!config.revenueCatWebhookAuthorization || !config.revenueCatWebhookHmacSecret) return reply.code(503).send({ error: 'STORE_BILLING_NOT_CONFIGURED' });
    if (!safeEqual(String(request.headers.authorization || ''), config.revenueCatWebhookAuthorization)) return reply.code(401).send({ error: 'WEBHOOK_AUTHORIZATION_INVALID' });
    if (!verifyRevenueCatSignature(request.rawBody, request.headers['x-revenuecat-webhook-signature'], config.revenueCatWebhookHmacSecret, config.revenueCatWebhookToleranceSeconds)) {
      return reply.code(400).send({ error: 'WEBHOOK_SIGNATURE_INVALID' });
    }
    let payload;
    try { payload = JSON.parse(Buffer.from(request.rawBody).toString('utf8')); }
    catch { return reply.code(400).send({ error: 'WEBHOOK_JSON_INVALID' }); }
    const event = payload.event || {};
    if (!event.id || !event.type) return reply.code(400).send({ error: 'WEBHOOK_EVENT_INVALID' });

    const eventHash = sha256(request.rawBody);
    const prior = await pool.query('SELECT processed_at,body_hash FROM store_events WHERE event_id=$1', [event.id]);
    if (prior.rowCount) {
      if (prior.rows[0].body_hash !== eventHash) return reply.code(409).send({ error: 'WEBHOOK_EVENT_CONFLICT' });
      if (prior.rows[0].processed_at) return { received: true, duplicate: true };
    } else {
      const claim = await pool.query(
        "INSERT INTO store_events(event_id,provider,event_type,body_hash) VALUES($1,'revenuecat',$2,$3) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",
        [event.id, event.type, eventHash]
      );
      // A concurrent duplicate delivery already inserted this event; treat as duplicate rather than 500.
      if (!claim.rowCount) return { received: true, duplicate: true };
    }

    const userId = event.app_user_id;
    const credits = Number(config.revenueCatCreditProducts[event.product_id] || 0);
    await withTransaction(pool, async client => {
      if (userId && credits > 0 && ['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE'].includes(event.type)) {
        const user = await client.query('SELECT id FROM users WHERE id=$1', [userId]);
        if (user.rowCount) {
          const ledger = await client.query(
            `INSERT INTO credit_ledger(id,user_id,direction,credits,source,external_reference,metadata)
             VALUES($1,$2,'credit',$3,'revenuecat_purchase',$4,$5::jsonb)
             ON CONFLICT(source,external_reference) DO NOTHING RETURNING id`,
            [newId(), userId, credits, event.id, JSON.stringify({ productId: event.product_id, environment: event.environment || null })]
          );
          if (ledger.rowCount) await client.query(
            `INSERT INTO wallet_balances(user_id,credits) VALUES($1,$2)
             ON CONFLICT(user_id) DO UPDATE SET credits=wallet_balances.credits+EXCLUDED.credits,updated_at=CURRENT_TIMESTAMP`,
            [userId, credits]
          );
        }
      }
      if (userId && config.revenueCatPremiumEntitlement && eventTargetsEntitlement(event, config.revenueCatPremiumEntitlement)) {
        const active = event.type !== 'EXPIRATION';
        const expiresAt = event.expiration_at_ms ? new Date(Number(event.expiration_at_ms)) : null;
        await client.query(
          `INSERT INTO platform_entitlements(user_id,entitlement,status,expires_at,source)
           SELECT id,$2,$3,$4,'revenuecat' FROM users WHERE id=$1
           ON CONFLICT(user_id,entitlement) DO UPDATE SET status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,source='revenuecat',updated_at=CURRENT_TIMESTAMP`,
          [userId, config.revenueCatPremiumEntitlement, active ? 'active' : 'inactive', expiresAt]
        );
      }
      await client.query('UPDATE store_events SET processed_at=CURRENT_TIMESTAMP WHERE event_id=$1', [event.id]);
    });
    return { received: true };
  });
}
