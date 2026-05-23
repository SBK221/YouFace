import nodemailer from 'nodemailer';

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || user === 'your_email@gmail.com') {
    throw new Error('GMAIL_USER non configuré dans .env');
  }
  if (!pass || pass === 'xxxx xxxx xxxx xxxx') {
    throw new Error('GMAIL_APP_PASSWORD non configuré dans .env');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

function postToHtml(post) {
  const hashtags = Array.isArray(post.hashtags)
    ? post.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:10px;background:#fafafa;">
      <h2 style="color:#1a1a2e;margin-top:0;">${post.title || 'Post'}</h2>
      ${post.content ? `<p style="color:#444;line-height:1.7;white-space:pre-line;">${post.content}</p>` : ''}
      ${post.post ? `<p style="color:#444;line-height:1.7;white-space:pre-line;">${post.post}</p>` : ''}
      ${hashtags ? `<p style="color:#1877f2;font-size:14px;">${hashtags}</p>` : ''}
      ${post.imageUrl ? `<img src="${post.imageUrl}" alt="image" style="max-width:100%;border-radius:6px;margin-top:10px;">` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
      <p style="color:#999;font-size:12px;">Créé le ${new Date(post.createdAt).toLocaleDateString('fr-FR')}</p>
    </div>`;
}

export async function sendPostByEmail(post, toEmail) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Social Content" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `📱 ${post.title || 'Nouveau post'} — Social Content Automation`,
    html: postToHtml(post),
  });
}

export async function sendBulkByEmail(posts, toEmail) {
  const transporter = createTransporter();
  const postsHtml = posts.map(postToHtml).join('<br>');
  await transporter.sendMail({
    from: `"Social Content" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `📦 ${posts.length} posts — Social Content Automation`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
        <h1 style="color:#1a1a2e;">Vos ${posts.length} posts</h1>
        ${postsHtml}
      </div>`,
  });
}
