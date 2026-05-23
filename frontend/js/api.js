const BASE = '/api';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  posts: {
    list: () => req('GET', '/posts'),
    get: id => req('GET', `/posts/${id}`),
    create: data => req('POST', '/posts', data),
    update: (id, data) => req('PUT', `/posts/${id}`, data),
    delete: id => req('DELETE', `/posts/${id}`),
  },
  scheduler: {
    schedule: (postId, scheduledTime) => req('POST', `/scheduler/schedule/${postId}`, { scheduledTime }),
    cancel: postId => req('POST', `/scheduler/cancel/${postId}`),
    list: () => req('GET', '/scheduler/list'),
  },
  ai: {
    generatePost: (topic, style, length) => req('POST', '/ai/generate-post', { topic, style, length }),
    generateIdeas: (topic, count) => req('POST', '/ai/generate-ideas', { topic, count }),
  },
  publish: {
    sendEmail: (postId, toEmail) => req('POST', '/publish/email/send-post', { postId, toEmail }),
    sendBulkEmail: (postIds, toEmail) => req('POST', '/publish/email/send-bulk', { postIds, toEmail }),
  },
  social: {
    status: () => req('GET', '/social/status'),
  },
};
