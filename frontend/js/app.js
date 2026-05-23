import { api } from './api.js';

let posts = [];
let currentFilter = 'all';
let editingPostId = null;
let emailTargetPostId = null;
let scheduleTargetPostId = null;

async function loadPosts() {
  try {
    posts = await api.posts.list();
    renderPosts();
  } catch (err) {
    showToast('Impossible de charger les posts: ' + err.message, 'error');
  }
}

async function loadStatus() {
  try {
    const status = await api.social.status();
    const bar = document.getElementById('statusIndicators');
    bar.innerHTML = Object.entries(status).map(([key, on]) =>
      `<span class="status-dot ${on ? 'on' : ''}" title="${key}: ${on ? 'configuré' : 'non configuré'}"></span>`
    ).join('');
  } catch {}
}

function renderPosts() {
  const container = document.getElementById('postsList');
  const filtered = currentFilter === 'all' ? posts : posts.filter(p => p.status === currentFilter);

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Aucun post ${currentFilter !== 'all' ? `"${currentFilter}"` : ''}</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(post => `
    <div class="post-card">
      <div class="post-card-header">
        <h3>${escHtml(post.title || 'Sans titre')}</h3>
        <span class="status-badge status-${post.status}">${statusLabel(post.status)}</span>
      </div>
      <div class="post-content">${escHtml(post.content || post.post || '')}</div>
      ${post.hashtags?.length ? `<div class="post-hashtags">${post.hashtags.map(h => `#${h}`).join(' ')}</div>` : ''}
      <div class="post-date">${new Date(post.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
      <div class="post-actions">
        <button class="btn btn-secondary btn-sm" onclick="editPost('${post.id}')">✏️ Éditer</button>
        <button class="btn btn-secondary btn-sm" onclick="openEmailModal('${post.id}')">📧 Email</button>
        <button class="btn btn-secondary btn-sm" onclick="openScheduleModal('${post.id}')">📅 Planifier</button>
        <button class="btn btn-danger btn-sm" onclick="deletePost('${post.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function statusLabel(s) {
  return { draft: 'Brouillon', scheduled: 'Planifié', published: 'Publié' }[s] || s;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.openModal = function(postId = null) {
  editingPostId = postId;
  document.getElementById('modalTitle').textContent = postId ? 'Modifier le post' : 'Nouveau post';
  if (postId) {
    const post = posts.find(p => p.id === postId);
    document.getElementById('postTitle').value = post.title || '';
    document.getElementById('postContent').value = post.content || post.post || '';
    document.getElementById('postHashtags').value = Array.isArray(post.hashtags) ? post.hashtags.join(', ') : (post.hashtags || '');
    document.getElementById('postImageUrl').value = post.imageUrl || '';
  } else {
    document.getElementById('postForm').reset();
  }
  document.getElementById('modal').classList.remove('hidden');
};

window.closeModal = () => document.getElementById('modal').classList.add('hidden');

document.getElementById('postForm').addEventListener('submit', async e => {
  e.preventDefault();
  const hashtags = document.getElementById('postHashtags').value
    .split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean);
  const data = {
    title: document.getElementById('postTitle').value,
    content: document.getElementById('postContent').value,
    hashtags,
    imageUrl: document.getElementById('postImageUrl').value || undefined,
  };
  try {
    if (editingPostId) {
      await api.posts.update(editingPostId, data);
      showToast('Post modifié', 'success');
    } else {
      await api.posts.create(data);
      showToast('Post créé', 'success');
    }
    closeModal();
    loadPosts();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.editPost = id => openModal(id);

window.deletePost = async function(id) {
  if (!confirm('Supprimer ce post ?')) return;
  try {
    await api.posts.delete(id);
    showToast('Post supprimé', 'success');
    loadPosts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openEmailModal = function(postId) {
  emailTargetPostId = postId;
  document.getElementById('emailTo').value = '';
  document.getElementById('emailModal').classList.remove('hidden');
};
window.closeEmailModal = () => document.getElementById('emailModal').classList.add('hidden');

window.confirmSendEmail = async function() {
  const toEmail = document.getElementById('emailTo').value.trim();
  if (!toEmail) return showToast('Entrez un email', 'error');
  try {
    await api.publish.sendEmail(emailTargetPostId, toEmail);
    showToast('Email envoyé !', 'success');
    closeEmailModal();
    loadPosts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openScheduleModal = function(postId) {
  scheduleTargetPostId = postId;
  const input = document.getElementById('scheduleTime');
  const now = new Date(Date.now() + 60000);
  input.min = now.toISOString().slice(0, 16);
  input.value = '';
  document.getElementById('scheduleModal').classList.remove('hidden');
};
window.closeScheduleModal = () => document.getElementById('scheduleModal').classList.add('hidden');

window.confirmSchedule = async function() {
  const time = document.getElementById('scheduleTime').value;
  if (!time) return showToast('Choisissez une date', 'error');
  try {
    await api.scheduler.schedule(scheduleTargetPostId, new Date(time).toISOString());
    showToast('Publication planifiée !', 'success');
    closeScheduleModal();
    loadPosts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    renderPosts();
  });
});

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => t.classList.add('hidden'), 3500);
}

loadPosts();
loadStatus();
