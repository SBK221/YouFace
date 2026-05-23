import { api } from './api.js';

let lastGenerated = null;

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function setLoading(btnId, textId, loading) {
  const btn = document.getElementById(btnId);
  const span = document.getElementById(textId);
  btn.disabled = loading;
  span.innerHTML = loading ? '<span class="spinner"></span> Génération...' : span.dataset.default;
}

window.generatePost = async function() {
  const topic = document.getElementById('postTopic').value.trim();
  if (!topic) return showToast('Entrez un sujet', 'error');

  const style = document.getElementById('postStyle').value;
  const length = document.getElementById('postLength').value;

  document.getElementById('generatePostText').dataset.default = '⚡ Générer';
  setLoading('generatePostBtn', 'generatePostText', true);
  document.getElementById('postResult').classList.add('hidden');

  try {
    const result = await api.ai.generatePost(topic, style, length);
    lastGenerated = result;

    document.getElementById('generatedPost').textContent = result.post || '';
    document.getElementById('generatedDescription').textContent = result.description || '';
    document.getElementById('generatedHashtags').innerHTML = (result.hashtags || [])
      .map(h => `<span class="hashtag">#${h.replace(/^#/, '')}</span>`).join('');

    document.getElementById('postResult').classList.remove('hidden');
    showToast('Post généré !', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('generatePostBtn', 'generatePostText', false);
  }
};

window.saveGeneratedPost = async function() {
  if (!lastGenerated) return;
  try {
    const topic = document.getElementById('postTopic').value.trim();
    await api.posts.create({
      title: topic,
      content: lastGenerated.post,
      hashtags: lastGenerated.hashtags,
      description: lastGenerated.description,
    });
    showToast('Post sauvegardé !', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.generateIdeas = async function() {
  const topic = document.getElementById('ideasTopic').value.trim();
  if (!topic) return showToast('Entrez un sujet', 'error');

  const count = Number(document.getElementById('ideasCount').value) || 5;

  document.getElementById('generateIdeasText').dataset.default = '💡 Générer des idées';
  setLoading('generateIdeasBtn', 'generateIdeasText', true);
  document.getElementById('ideasResult').classList.add('hidden');

  try {
    const { ideas } = await api.ai.generateIdeas(topic, count);
    document.getElementById('ideasList').innerHTML = ideas
      .map((idea, i) => `<li><span class="idea-num">${i + 1}.</span> ${idea}</li>`)
      .join('');
    document.getElementById('ideasResult').classList.remove('hidden');
    showToast(`${ideas.length} idées générées !`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading('generateIdeasBtn', 'generateIdeasText', false);
  }
};
