export async function analyticsRoutes(app, ctx) {
  const { pool, auth } = ctx;

  app.get('/api/creator/analytics', { preHandler: auth.requireAuth }, async request => {
    const [summary, top, trend] = await Promise.all([
      pool.query(
        `SELECT
          COALESCE(SUM(cs.view_count),0)::bigint AS views,
          COALESCE(SUM(cs.watched_seconds),0)::numeric AS watched_seconds,
          COALESCE(SUM(cs.like_count),0)::bigint AS likes,
          (SELECT COUNT(*) FROM follows WHERE following_id=$1)::bigint AS followers,
          (SELECT COALESCE(SUM(net_amount),0) FROM creator_earnings WHERE creator_id=$1 AND status='recorded' AND currency <> 'YFC')::bigint AS net_earnings,
          (SELECT COALESCE(SUM(net_amount),0) FROM creator_earnings WHERE creator_id=$1 AND status='recorded' AND currency = 'YFC')::bigint AS tip_credits,
          (SELECT COUNT(*) FROM paid_subscriptions WHERE creator_id=$1 AND status IN ('active','trialing'))::bigint AS paid_subscribers
         FROM content c LEFT JOIN content_stats cs ON cs.content_id=c.id WHERE c.author_id=$1`,[request.auth.id]
      ),
      pool.query(
        `SELECT c.id,c.type,c.title,c.body,c.created_at,
                COALESCE(cs.view_count,0)::bigint AS views,COALESCE(cs.like_count,0)::bigint AS likes,COALESCE(cs.comment_count,0)::bigint AS comments
         FROM content c LEFT JOIN content_stats cs ON cs.content_id=c.id
         WHERE c.author_id=$1 AND c.status='published'
         ORDER BY (COALESCE(cs.view_count,0)*3 + COALESCE(cs.like_count,0)*2) DESC,c.created_at DESC
         LIMIT 10`,[request.auth.id]
      ),
      pool.query(
        `SELECT v.view_date AS day,COUNT(*)::int AS views,COALESCE(SUM(v.watched_seconds),0)::numeric AS watched_seconds
         FROM content_views v JOIN content c ON c.id=v.content_id
         WHERE c.author_id=$1 AND v.view_date >= CURRENT_DATE - INTERVAL '29 days'
         GROUP BY v.view_date ORDER BY v.view_date ASC`,[request.auth.id]
      )
    ]);
    const s=summary.rows[0];
    return {
      summary:{views:Number(s.views),watchedSeconds:Number(s.watched_seconds),followers:Number(s.followers),likes:Number(s.likes),netEarningsMinor:Number(s.net_earnings),paidSubscribers:Number(s.paid_subscribers),tipCredits:Number(s.tip_credits)},
      top:top.rows.map(r=>({...r,views:Number(r.views),likes:Number(r.likes),comments:Number(r.comments)})),
      trend:trend.rows.map(r=>({day:r.day,views:r.views,watchedSeconds:Number(r.watched_seconds)}))
    };
  });

  app.get('/api/creator/monetization', { preHandler: auth.requireAuth }, async request => {
    const result=await pool.query(
      `SELECT u.stripe_account_id,
              (SELECT COUNT(*)::int FROM paid_subscriptions WHERE creator_id=u.id AND status IN ('active','trialing')) AS paid_subscribers,
              (SELECT COALESCE(SUM(net_amount),0)::bigint FROM creator_earnings WHERE creator_id=u.id AND status='recorded' AND currency <> 'YFC') AS net_earnings,
              (SELECT COALESCE(SUM(net_amount),0)::bigint FROM creator_earnings WHERE creator_id=u.id AND status='recorded' AND currency = 'YFC') AS tip_credits
       FROM users u WHERE u.id=$1`,[request.auth.id]
    );
    const row=result.rows[0];
    return {connectReady:Boolean(row.stripe_account_id),paidSubscribers:row.paid_subscribers,netEarningsMinor:Number(row.net_earnings),tipCredits:Number(row.tip_credits),currency:'eur'};
  });
}
