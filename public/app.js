const $ = selector => document.querySelector(selector);
const app = $('#app');
const API_BASE = String(window.YOUFACE_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
const IS_NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());
const apiUrl = path => `${API_BASE}${path}`;
const toast = $('#toast');
const modal = $('#modal');
let toastTimer = 0;

const state = {
  user: null,
  csrf: null,
  sessionToken: null,
  route: location.hash.slice(1) || 'home',
  feed: [],
  nextCursor: null,
  commentsOpen: new Set(),
  conversations: [],
  activeConversation: null,
  messages: [],
  notifications: [],
  reports: [],
  eventSource: null,
  pollTimer: 0,
  phoneCodeSent: false,
  billingReadiness: null,
  walletCredits: 0
};

const ROUTES = [
  ['home','Accueil','⌂'],['videos','Vidéos','▣'],['shorts','Shorts','▯'],['messages','Messages','✉'],
  ['studio','Studio','⌘'],['creator','Creator Center','⌁'],['notifications','Notifications','◉'],['moderation','Modération','⚑'],['profile','Profil','◇'],['settings','Paramètres','⚙']
];
const MOBILE = [['home','Accueil','⌂'],['shorts','Shorts','▯'],['create','Créer','＋'],['studio','Studio','⌘'],['profile','Profil','◇']];
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const mono = value => String(value || 'YF').split(/\s+/).slice(0,2).map(v => v[0]).join('').toUpperCase();

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (IS_NATIVE) {
    headers.set('X-YouFace-Client','native');
    headers.set('X-YouFace-Platform', window.YouFaceIdentity?.platform || 'android');
  }
  if (IS_NATIVE && state.sessionToken) headers.set('Authorization',`Bearer ${state.sessionToken}`);
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
    headers.set('Content-Type','application/json');
    options.body = JSON.stringify(options.body);
  }
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET','HEAD','OPTIONS'].includes(method) && state.csrf) headers.set('X-CSRF-Token',state.csrf);
  const response = await fetch(apiUrl(path),{...options,headers,credentials:'include'});
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function routeTo(route) {
  if (route === 'create') return openCreateModal();
  state.route = route;
  location.hash = route;
  render();
  loadRoute().catch(handleError);
}

function handleError(error) {
  console.error(error);
  if (error.status === 401) {
    state.user = null;
    state.csrf = null;
    closeEvents();
    render();
    return;
  }
  showToast(error.payload?.error || error.message || 'Erreur');
}

function authView() {
  const identity = window.YouFaceIdentity;
  const googleButton = identity?.googleEnabled
    ? `<button class="google-auth wide" type="button" data-google-auth><span class="google-mark">G</span> Continuer avec Google</button><div class="auth-separator"><span>ou</span></div>`
    : '';
  const gmailForm = `<div class="auth-separator"><span>ou</span></div><form data-gmail-auth><div class="field"><label>Adresse Gmail</label><input name="email" type="email" inputmode="email" autocomplete="email" placeholder="votrenom@gmail.com" pattern="[^@\s]+@gmail\.com" required></div><div class="field"><label>Mot de passe</label><input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></div><div class="error" data-auth-error></div><div class="auth-actions"><button class="primary wide" type="submit" data-gmail-action="register">Créer un compte Gmail</button><button class="ghost wide" type="submit" data-gmail-action="login">Se connecter avec Gmail</button></div></form>`;
  const phoneStep = state.phoneCodeSent
    ? `<form data-phone-confirm><h2>Vérifier le numéro</h2><p class="muted">Saisis le code reçu par SMS.</p><div class="field"><label>Code de vérification</label><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4,8}" minlength="4" maxlength="8" required></div><div class="error" data-auth-error></div><button class="primary wide" type="submit">Valider le code</button><button class="ghost wide" type="button" data-phone-reset>Changer de numéro</button></form>`
    : `<div><h2>Connexion / inscription</h2><p class="muted">Numéro de téléphone, compte Google ou Gmail + mot de passe.</p>${googleButton}<form data-phone-start><div class="field"><label>Numéro de téléphone</label><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+221771234567" pattern="\+[1-9][0-9]{7,14}" required></div><p class="muted small">Un SMS de vérification peut être envoyé. Les frais SMS habituels peuvent s'appliquer.</p><div id="firebase-recaptcha" class="recaptcha-box"></div><div class="error" data-auth-error></div><button class="primary wide" type="submit">Recevoir le code</button></form>${gmailForm}</div>`;
  return `<section class="auth-shell"><div class="auth-brand"><div class="brand"><span class="brand-mark">YF</span>YouFace</div><div><div class="eyebrow">Staging 0.4.1</div><h1>Créer. Publier. Grandir.</h1><p>Identité Firebase vérifiée par le backend YouFace. Les mots de passe Gmail sont gérés par Firebase Authentication et ne sont pas stockés dans PostgreSQL YouFace.</p></div><div class="muted small">YouFace Technologies · environnement de test interne</div></div><div class="auth-panel"><div class="auth-card">${phoneStep}</div></div></section>`;
}

async function exchangeIdentity(idToken) {
  const data = await api('/api/auth/exchange',{method:'POST',body:{idToken}});
  state.user=data.user; state.csrf=data.csrfToken; state.sessionToken=data.sessionToken||null; state.phoneCodeSent=false;
  render(); openEvents();
  await window.YouFaceBilling?.configure?.(state.user.id).catch(() => {});
  await loadFeed(true); await loadRoute();
}

function shellView() {
  const visibleRoutes = ROUTES.filter(([id]) => id !== 'moderation' || ['moderator','admin'].includes(state.user.role));
  const nav = visibleRoutes.map(([id,label,icon]) => `<button data-route="${id}" class="${state.route===id?'active':''}"><span class="nav-icon">${icon}</span>${label}</button>`).join('');
  const mobile = MOBILE.map(([id,label,icon]) => `<button data-route="${id}" class="${state.route===id?'active':''}"><span>${icon}</span>${label}</button>`).join('');
  return `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">YF</span>YouFace</div><nav class="nav">${nav}</nav><button class="primary" data-route="create">＋ Créer</button><div class="sidebar-foot"><div class="user-line"><div class="mono">${esc(mono(state.user.displayName))}</div><div><strong>${esc(state.user.displayName)}</strong><div class="muted small">@${esc(state.user.username)}</div></div></div><button class="ghost wide" data-logout>Déconnexion</button></div></aside><main class="main"><header class="topbar"><div class="brand"><span class="brand-mark">YF</span>YouFace</div><input class="search" type="search" placeholder="Rechercher sur YouFace" data-search><div class="top-actions"><button class="icon-btn" data-route="messages">✉</button><button class="icon-btn" data-route="notifications">◉</button></div></header><section class="content" id="screen">${routeView()}</section></main><nav class="mobile-nav">${mobile}</nav></div>`;
}

function routeView() {
  const views = { home:homeView,videos:videosView,shorts:shortsView,messages:messagesView,studio:studioView,creator:creatorView,notifications:notificationsView,moderation:moderationView,profile:profileView,settings:settingsView };
  return (views[state.route] || homeView)();
}

function homeView() {
  return `<div class="page-head"><div><div class="eyebrow">Flux réel</div><h1>Accueil</h1></div><button class="primary" data-route="create">Créer un contenu</button></div><div class="feed"><div class="stack"><article class="card card-pad composer"><form data-create-post><div class="field"><textarea name="body" maxlength="5000" placeholder="Publier une idée, une analyse, une annonce..." required></textarea></div><div class="row between"><span class="muted small">Publication texte réelle</span><button class="primary" type="submit">Publier</button></div></form></article><div id="feedList">${feedMarkup(state.feed)}</div><button class="ghost wide" data-load-more ${state.nextCursor?'':'hidden'}>Charger la suite</button></div><aside class="stack"><div class="card card-pad"><div class="eyebrow">Infrastructure</div><h3>Staging 0.4</h3><p class="muted">Firebase téléphone/Google/Gmail, sessions serveur, PostgreSQL, upload vidéo, FFmpeg, facturation Store/Web et analytics réels.</p></div><div class="card card-pad"><h3>Règle visuelle</h3><span class="pill">Zéro visage</span><p class="muted small">Monogrammes, abstractions, objets et paysages sans personnes.</p></div></aside></div>`;
}

function feedMarkup(items) {
  if (!items.length) return `<div class="card empty">Aucune publication. Crée la première publication YouFace.</div>`;
  return items.map(item => `<article class="card post" data-content-id="${item.id}"><div class="post-head"><div class="mono">${esc(mono(item.author.displayName))}</div><div><strong>${esc(item.author.displayName)}</strong><div class="muted small">@${esc(item.author.username)} · ${new Date(item.createdAt).toLocaleString('fr-FR')}</div></div></div>${item.title?`<h3>${esc(item.title)}</h3>`:''}${item.body?`<div class="post-copy">${esc(item.body)}</div>`:''}${item.media?.url?`<div class="media-box"><video controls preload="metadata" poster="${esc(item.media.thumbnailUrl||'')}"><source src="${esc(item.media.url)}" type="video/mp4"></video></div>`:''}<div class="post-actions"><button data-like="${item.id}" class="${item.likedByMe?'active':''}">♡ ${item.likes}</button><button data-comments="${item.id}">◌ ${item.comments}</button><button data-view="${item.id}">◉ ${item.views} vues</button>${item.author.id!==state.user.id?`<button data-follow="${item.author.id}">＋ Suivre</button>${IS_NATIVE?`<button data-tip="${item.author.id}">◇ Soutenir</button>`:`<button data-paid-subscribe="${item.author.id}">◆ Premium Web</button>`}`:''}<button data-report="${item.id}">⚑ Signaler</button></div><div class="comments" data-comments-box="${item.id}" ${state.commentsOpen.has(item.id)?'':'hidden'}></div></article>`).join('');
}

function videosView() {
  const videos = state.feed.filter(item => item.type === 'video');
  return `<div class="page-head"><div><div class="eyebrow">Médias</div><h1>Vidéos</h1></div><button class="primary" data-upload-modal>Importer une vidéo</button></div><div class="video-grid">${videos.length?videos.map(item=>`<article class="card video-card"><div class="thumb"></div><div class="card-pad"><h3>${esc(item.title)}</h3><div class="muted small">${item.views} vues · ${Math.round(item.media?.durationSeconds||0)} s</div></div></article>`).join(''):'<div class="card empty">Aucune vidéo publiée.</div>'}</div><div class="page-head"><div><div class="eyebrow">Traitement</div><h1>Médias importés</h1></div></div><div id="mediaLibrary" class="stack"><div class="card empty">Chargement...</div></div>`;
}

function shortsView() {
  const shorts = state.feed.filter(item => item.type === 'short');
  return `<div class="page-head"><div><div class="eyebrow">Vertical 9:16</div><h1>Shorts</h1></div><button class="primary" data-upload-modal>Importer</button></div><div class="shorts">${shorts.length?shorts.map(item=>`<article class="card short"><div class="short-info"><h3>${esc(item.title)}</h3><div class="muted">@${esc(item.author.username)}</div></div><div class="short-actions"><button data-like="${item.id}">♡</button><button data-comments="${item.id}">◌</button><button data-report="${item.id}">⚑</button></div></article>`).join(''):'<div class="card empty">Aucun Short publié. Une vidéo verticale traitée peut être publiée ici.</div>'}</div>`;
}

function messagesView() {
  return `<div class="page-head"><div><div class="eyebrow">Temps réel serveur</div><h1>Messages</h1></div><button class="primary" data-new-conversation>Nouveau message</button></div><div class="card conversation-layout"><div class="conversation-list">${state.conversations.length?state.conversations.map(c=>`<button data-conversation="${c.id}" class="${state.activeConversation===c.id?'active':''}"><strong>${esc(c.participants?.[0]?.displayName||'Conversation')}</strong><div class="muted small">${esc(c.lastMessage||'Aucun message')}</div></button>`).join(''):'<div class="empty">Aucune conversation</div>'}</div><div class="message-pane"><div class="message-list">${state.messages.length?state.messages.map(m=>`<div class="message ${m.sender.id===state.user.id?'mine':''}"><strong>${esc(m.sender.displayName)}</strong><div>${esc(m.body)}</div></div>`).join(''):'<div class="empty">Sélectionne une conversation.</div>'}</div>${state.activeConversation?`<form class="message-form" data-message-form><input name="body" required maxlength="4000" placeholder="Écrire un message"><button class="primary">Envoyer</button></form>`:''}</div></div>`;
}

function studioView() {
  return `<div class="page-head"><div><div class="eyebrow">YouFace Studio</div><h1>Montage intégré</h1></div><button class="primary" data-upload-modal>Importer</button></div><div class="studio"><div class="card toolbox">${['Importer','Découper','Sous-titres','Texte','Audio','Transitions','Traduction','Shorts auto'].map(x=>`<button data-studio-action>${x}</button>`).join('')}</div><div class="card card-pad"><div class="preview">YF</div><div class="timeline"><div class="muted small">00:00 ───────── 00:30 ───────── 01:00</div><div class="track"></div><div class="track audio"></div></div></div><div class="card properties"><h3>Propriétés</h3><p class="muted">Le transcodage vidéo 720p et la miniature sont réellement exécutés par le worker FFmpeg. Les fonctions d’édition avancée restent la prochaine couche Studio.</p><span class="pill">Worker média réel</span></div></div>`;
}

function creatorView() {
  return `<div class="page-head"><div><div class="eyebrow">Données et revenus réels</div><h1>Creator Center</h1></div><div id="creatorActions"></div></div><div id="analytics"><div class="card empty">Chargement des analytics et de la facturation...</div></div>`;
}

function notificationsView() {
  return `<div class="page-head"><div><div class="eyebrow">Événements serveur</div><h1>Notifications</h1></div></div><div class="card">${state.notifications.length?state.notifications.map(n=>`<div class="notification ${n.readAt?'':'unread'}" data-notification="${n.id}"><div class="mono">${esc(mono(n.actor?.displayName||'YF'))}</div><div><strong>${esc(n.actor?.displayName||'YouFace')}</strong><div>${esc(notificationText(n.type))}</div><div class="muted small">${new Date(n.createdAt).toLocaleString('fr-FR')}</div></div></div>`).join(''):'<div class="empty">Aucune notification.</div>'}</div>`;
}
const notificationText = type => ({like:'a aimé votre contenu',comment:'a commenté votre contenu',follow:'s’est abonné à votre profil',message:'vous a envoyé un message'})[type]||'Nouvelle activité';


function moderationView() {
  if (!['moderator','admin'].includes(state.user.role)) return `<div class="card empty">Accès réservé à la modération.</div>`;
  return `<div class="page-head"><div><div class="eyebrow">Défense de la plateforme</div><h1>Modération</h1></div><button class="secondary" data-refresh-moderation>Actualiser</button></div><div class="stack">${state.reports.length?state.reports.map(r=>`<article class="card card-pad"><div class="row between"><div><strong>${esc(r.target_type)} · ${esc(r.reason)}</strong><div class="muted small">Signalé par @${esc(r.reporter_username)} · ${new Date(r.created_at).toLocaleString('fr-FR')}</div></div><span class="pill">${esc(r.status)}</span></div><p>${esc(r.details||'Aucun détail')}</p><div class="row"><button class="secondary" data-moderation-action="resolve" data-report-id="${r.id}">Résoudre</button><button class="ghost" data-moderation-action="dismiss" data-report-id="${r.id}">Rejeter</button>${r.target_type==='content'?`<button class="danger" data-moderation-action="hide_content" data-report-id="${r.id}">Masquer</button><button class="danger" data-moderation-action="remove_content" data-report-id="${r.id}">Retirer</button>`:''}${r.target_type==='user'?`<button class="danger" data-moderation-action="suspend_user" data-report-id="${r.id}">Suspendre</button>`:''}</div></article>`).join(''):'<div class="card empty">Aucun signalement ouvert.</div>'}</div>`;
}

function profileView() {
  return `<div class="card card-pad"><div class="row between"><div class="row"><div class="mono">${esc(mono(state.user.displayName))}</div><div><h2>${esc(state.user.displayName)}</h2><div class="muted">@${esc(state.user.username)} · ${esc(state.user.country||'')}</div></div></div><button class="secondary" data-edit-profile>Modifier</button></div><p>${esc(state.user.bio||'Aucune biographie.')}</p><span class="pill">${esc(state.user.accountType)}</span></div><div class="page-head"><div><div class="eyebrow">Mes contenus</div><h1>Publications</h1></div></div><div>${feedMarkup(state.feed.filter(item=>item.author.id===state.user.id))}</div>`;
}

function settingsView() {
  return `<div class="page-head"><div><div class="eyebrow">Application</div><h1>Paramètres</h1></div></div><div class="stack"><div class="card card-pad"><h3>Sécurité de session</h3><p class="muted">Firebase prouve l’identité par téléphone ou Google ; YouFace crée ensuite une session opaque hashée côté serveur avec CSRF sur le web.</p><span class="pill ok-text">Session active</span></div><div class="card card-pad"><h3>Infrastructure mobile</h3><p class="muted">La PWA fonctionne sur le même domaine que l’API. Pour Android/iOS, configure une API HTTPS de test avant la bêta appareil.</p></div><div class="card card-pad"><h3>Compte</h3><button class="danger" data-logout>Déconnexion</button></div></div>`;
}

function render() {
  app.innerHTML = state.user ? shellView() : authView();
}

async function loadFeed(reset=true) {
  const cursor = reset ? '' : state.nextCursor;
  const data = await api(`/api/feed?limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
  state.feed = reset ? data.items : [...state.feed,...data.items];
  state.nextCursor = data.nextCursor;
  if (state.user) render();
}

async function loadRoute() {
  if (!state.user) return;
  if (['home','videos','shorts','profile'].includes(state.route) && !state.feed.length) await loadFeed(true);
  if (state.route === 'videos') await loadMedia();
  if (state.route === 'messages') await loadConversations();
  if (state.route === 'notifications') await loadNotifications();
  if (state.route === 'creator') await loadAnalytics();
  if (state.route === 'moderation') await loadModeration();
}

async function loadMedia() {
  const data = await api('/api/media');
  const el = $('#mediaLibrary');
  if (!el) return;
  el.innerHTML = data.items.length ? data.items.map(m => `<article class="card card-pad"><div class="row between"><div><strong>${esc(m.id.slice(0,8))}</strong><div class="muted small">${m.width}×${m.height} · ${Math.round(m.durationSeconds)} s · ${(m.sizeBytes/1024/1024).toFixed(1)} Mo</div></div><span class="pill ${m.status==='ready'?'ok-text':m.status==='failed'?'danger-text':''}">${esc(m.status)}</span></div>${m.status==='ready'?`<div class="row"><button class="secondary" data-publish-media="${m.id}" data-media-vertical="${m.height>m.width}">Publier</button></div>`:''}${m.error?`<p class="danger-text">${esc(m.error)}</p>`:''}</article>`).join('') : '<div class="card empty">Aucun média importé.</div>';
}

async function loadConversations() {
  const data = await api('/api/conversations');
  state.conversations = data.items;
  render();
  if (state.activeConversation) await loadMessages(state.activeConversation);
}
async function loadMessages(id) {
  const data = await api(`/api/conversations/${id}/messages?limit=100`);
  state.messages = data.items;
  state.activeConversation = id;
  render();
}
async function loadNotifications() {
  const data = await api('/api/notifications?limit=100');
  state.notifications = data.items;
  render();
}
async function loadModeration() {
  const data = await api('/api/moderation/reports?status=open&limit=100');
  state.reports = data.items;
  render();
}
async function loadAnalytics() {
  const [analytics,monetization,readiness,wallet] = await Promise.all([
    api('/api/creator/analytics'), api('/api/creator/monetization'), api('/api/billing/readiness'), api('/api/billing/wallet')
  ]);
  state.billingReadiness = readiness; state.walletCredits = wallet.credits;
  const el = $('#analytics'); const actions = $('#creatorActions');
  if (!el) return;
  if (actions) {
    actions.innerHTML = IS_NATIVE
      ? `<button class="primary" data-buy-credits>＋ Acheter des crédits</button><button class="ghost" data-restore-purchases>Restaurer</button>`
      : `<button class="primary" data-connect-stripe>${readiness.payoutReady?'Compte de versement actif':'Activer les versements'}</button>`;
  }
  const s = analytics.summary;
  const bars = analytics.trend.length ? analytics.trend.map(x=>{const height=Math.max(5,Math.min(100,Math.ceil((x.views*5)/5)*5));return `<div class="bar h${height}" title="${esc(x.day)}: ${x.views} vues"></div>`;}).join('') : '<div class="muted">Pas encore de vues.</div>';
  const readinessText = readiness.blockingReasons.length ? readiness.blockingReasons.map(esc).join(' · ') : 'Facturation configurée pour cette plateforme';
  el.innerHTML = `<div class="stats"><div class="card stat"><span class="muted">Vues</span><strong>${s.views}</strong></div><div class="card stat"><span class="muted">Abonnés</span><strong>${s.followers}</strong></div><div class="card stat"><span class="muted">Watch time</span><strong>${Math.round(s.watchedSeconds/60)} min</strong></div><div class="card stat"><span class="muted">Revenus cash</span><strong>${(s.netEarningsMinor/100).toFixed(2)} €</strong></div></div><div class="grid grid-2"><div class="card card-pad"><h3>Vues · 30 jours</h3><div class="chart-bars">${bars}</div></div><div class="card card-pad"><h3>Monétisation</h3><p>Plateforme : <strong>${esc(readiness.platform)}</strong></p><p>Crédits disponibles : <strong>${wallet.credits} YFC</strong></p><p>Pourboires créateur : <strong>${s.tipCredits} YFC nets</strong></p><p>Abonnés premium web : <strong>${monetization.paidSubscribers}</strong></p><p class="muted small">${readinessText}</p></div></div><div class="card card-pad"><h3>Meilleurs contenus</h3><table class="table"><thead><tr><th>Contenu</th><th>Vues</th><th>Likes</th><th>Commentaires</th></tr></thead><tbody>${analytics.top.map(x=>`<tr><td>${esc(x.title||x.body?.slice(0,60)||x.type)}</td><td>${x.views}</td><td>${x.likes}</td><td>${x.comments}</td></tr>`).join('')}</tbody></table></div>`;
}

function openCreditsModal() {
  const ids = window.YOUFACE_CONFIG?.creditProductIds || [];
  modal.innerHTML = `<div class="modal-body"><div class="page-head"><div><div class="eyebrow">Store billing</div><h2>Crédits YouFace</h2></div><button class="ghost" data-close-modal>Fermer</button></div><p class="muted">Les achats mobiles passent par Google Play ou l’App Store. Les crédits servent uniquement au soutien volontaire des créateurs.</p><div class="grid grid-3">${ids.map(id=>`<button class="secondary" data-credit-product="${esc(id)}">${esc(id.replace('youface_credits_',''))} YFC</button>`).join('')}</div><div class="error" data-billing-error></div></div>`;
  modal.showModal();
}

function openTipModal(creatorId) {
  modal.innerHTML = `<div class="modal-body"><div class="page-head"><div><div class="eyebrow">Soutien créateur</div><h2>Envoyer des crédits</h2></div><button class="ghost" data-close-modal>Fermer</button></div><p>Solde : <strong>${state.walletCredits} YFC</strong></p><form data-tip-form data-creator-id="${creatorId}"><div class="field"><label>Crédits</label><input name="credits" type="number" min="1" max="1000000" value="10" required></div><div class="error" data-billing-error></div><button class="primary wide">Envoyer le soutien</button></form></div>`;
  modal.showModal();
}

function openCreateModal() {
  modal.innerHTML = `<div class="modal-body"><div class="page-head"><div><div class="eyebrow">Créer</div><h2>Nouveau contenu</h2></div><button class="ghost" data-close-modal>Fermer</button></div><div class="grid grid-2"><button class="secondary" data-create-kind="post">Publication texte</button><button class="secondary" data-upload-modal>Vidéo / Short</button></div></div>`;
  modal.showModal();
}
function openUploadModal() {
  modal.innerHTML = `<div class="modal-body"><div class="page-head"><div><div class="eyebrow">Upload réel</div><h2>Importer une vidéo</h2></div><button class="ghost" data-close-modal>Fermer</button></div><form data-upload-form><div class="upload-zone"><input type="file" name="video" accept="video/*" required><p class="muted">Le fichier est vérifié, stocké et envoyé au worker FFmpeg.</p></div><div class="error" data-upload-error></div><button class="primary wide" type="submit">Importer et transcoder</button></form></div>`;
  if (!modal.open) modal.showModal();
}
function openPublishModal(mediaId, vertical) {
  modal.innerHTML = `<div class="modal-body"><h2>Publier le média</h2><form data-publish-video data-media-id="${mediaId}"><div class="field"><label>Titre</label><input name="title" required maxlength="180"></div><div class="field"><label>Description</label><textarea name="body" maxlength="5000"></textarea></div><div class="field"><label>Format</label><select name="type"><option value="video">Vidéo longue</option>${vertical?'<option value="short">Short vertical</option>':''}</select></div><button class="primary wide">Publier</button></form></div>`;
  modal.showModal();
}

function openComments(contentId) {
  state.commentsOpen.add(contentId);
  render();
  loadComments(contentId).catch(handleError);
}
async function loadComments(contentId) {
  const data = await api(`/api/content/${contentId}/comments`);
  const box = document.querySelector(`[data-comments-box="${contentId}"]`);
  if (!box) return;
  box.innerHTML = `${data.items.map(c=>`<div class="comment"><strong>${esc(c.author.displayName)}</strong><div>${esc(c.body)}</div></div>`).join('')}<form class="comment-form" data-comment-form="${contentId}"><input name="body" required maxlength="2000" placeholder="Commenter"><button class="secondary">Envoyer</button></form>`;
}

function openEditProfile() {
  modal.innerHTML = `<div class="modal-body"><h2>Modifier le profil</h2><form data-profile-form><div class="field"><label>Nom</label><input name="displayName" value="${esc(state.user.displayName)}" required></div><div class="field"><label>Bio</label><textarea name="bio" maxlength="500">${esc(state.user.bio||'')}</textarea></div><div class="field"><label>Pays</label><input name="country" value="${esc(state.user.country||'')}"></div><div class="field"><label>Type de compte</label><select name="accountType"><option value="user">Utilisateur</option><option value="creator">Créateur</option><option value="business">Entreprise</option></select></div><button class="primary wide">Enregistrer</button></form></div>`;
  modal.showModal();
}

function openNewConversation() {
  modal.innerHTML = `<div class="modal-body"><h2>Nouveau message</h2><form data-new-conversation-form><div class="field"><label>Identifiant YouFace</label><input name="username" required minlength="3" placeholder="exemple"></div><button class="primary wide">Ouvrir la conversation</button></form></div>`;
  modal.showModal();
}

async function boot() {
  let session = await api('/api/auth/session');
  state.user = session.user; state.csrf = session.csrfToken;
  if (!state.user && window.YouFaceIdentity?.configured) {
    const idToken = await window.YouFaceIdentity.getIdToken().catch(() => null);
    if (idToken) {
      await exchangeIdentity(idToken);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
      return;
    }
  }
  render();
  if (state.user) {
    openEvents(); await window.YouFaceBilling?.configure?.(state.user.id).catch(() => {}); await loadFeed(true); await loadRoute();
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function openEvents() {
  closeEvents();
  if (IS_NATIVE) {
    state.pollTimer = setInterval(() => {
      if (!state.user) return;
      api('/api/notifications?limit=100').then(data => { state.notifications = data.items; }).catch(() => {});
      if (state.route === 'messages' && state.activeConversation) loadMessages(state.activeConversation).catch(() => {});
    }, 10_000);
    return;
  }
  state.eventSource = new EventSource(apiUrl('/api/events'),{withCredentials:true});
  state.eventSource.addEventListener('notification', event => {
    const payload = JSON.parse(event.data);
    if (payload.notification) state.notifications.unshift(payload.notification);
    showToast('Nouvelle notification YouFace');
  });
  state.eventSource.addEventListener('message', event => {
    const payload=JSON.parse(event.data);
    if (state.route==='messages' && payload.conversationId===state.activeConversation) loadMessages(state.activeConversation).catch(handleError);
    else if (state.route==='messages') loadConversations().catch(handleError);
  });
}
function closeEvents() { state.eventSource?.close(); state.eventSource = null; clearInterval(state.pollTimer); state.pollTimer = 0; }

async function handleClick(event) {
  const route = event.target.closest('[data-route]')?.dataset.route;
  if (route) return routeTo(route);
  if (event.target.closest('[data-google-auth]')) {
    const idToken = await window.YouFaceIdentity.signInGoogle(); await exchangeIdentity(idToken); return;
  }
  if (event.target.closest('[data-phone-reset]')) { state.phoneCodeSent=false; render(); return; }
  if (event.target.closest('[data-buy-credits]')) return openCreditsModal();
  const productId = event.target.closest('[data-credit-product]')?.dataset.creditProduct;
  if (productId) {
    await window.YouFaceBilling.purchaseCredits(state.user.id, productId);
    showToast('Achat validé par le store — le webhook créditera le portefeuille'); modal.close(); return;
  }
  if (event.target.closest('[data-restore-purchases]')) {
    await window.YouFaceBilling.restore(state.user.id); showToast('Achats restaurés'); return loadAnalytics();
  }
  const tipCreatorId = event.target.closest('[data-tip]')?.dataset.tip;
  if (tipCreatorId) return openTipModal(tipCreatorId);
  if (event.target.closest('[data-close-modal]')) return modal.close();
  if (event.target.closest('[data-upload-modal]')) return openUploadModal();
  if (event.target.closest('[data-create-kind="post"]')) { modal.close(); routeTo('home'); return; }
  const like = event.target.closest('[data-like]')?.dataset.like;
  if (like) { await api(`/api/content/${like}/like`,{method:'POST',body:{}}); await loadFeed(true); return; }
  const followId = event.target.closest('[data-follow]')?.dataset.follow;
  if (followId) { const data=await api(`/api/profiles/${followId}/follow`,{method:'POST',body:{}});showToast(data.following?'Abonnement activé':'Abonnement retiré');return; }
  const paidCreatorId = event.target.closest('[data-paid-subscribe]')?.dataset.paidSubscribe;
  if (paidCreatorId) { const data=await api(`/api/billing/creators/${paidCreatorId}/subscribe`,{method:'POST',body:{}});location.href=data.url;return; }
  const comments = event.target.closest('[data-comments]')?.dataset.comments;
  if (comments) return openComments(comments);
  const viewId = event.target.closest('[data-view]')?.dataset.view;
  if (viewId) { await api(`/api/content/${viewId}/view`,{method:'POST',body:{watchedSeconds:1}}); showToast('Vue enregistrée'); return; }
  const reportId = event.target.closest('[data-report]')?.dataset.report;
  if (reportId) { await api('/api/reports',{method:'POST',body:{targetType:'content',targetId:reportId,reason:'user_report',details:'Signalement depuis l’interface alpha'}}); showToast('Signalement envoyé à la modération'); return; }
  const mediaId = event.target.closest('[data-publish-media]')?.dataset.publishMedia;
  if (mediaId) return openPublishModal(mediaId,event.target.closest('[data-publish-media]').dataset.mediaVertical==='true');
  const conversationId = event.target.closest('[data-conversation]')?.dataset.conversation;
  if (conversationId) return loadMessages(conversationId);
  if (event.target.closest('[data-new-conversation]')) return openNewConversation();
  if (event.target.closest('[data-refresh-moderation]')) return loadModeration();
  const moderationButton = event.target.closest('[data-moderation-action]');
  if (moderationButton) {
    const reason = window.prompt('Motif de la décision de modération :','Décision de modération YouFace');
    if (!reason || reason.trim().length < 3) return;
    await api(`/api/moderation/reports/${moderationButton.dataset.reportId}/action`,{method:'POST',body:{action:moderationButton.dataset.moderationAction,reason:reason.trim()}});
    showToast('Action de modération enregistrée');
    return loadModeration();
  }
  const notificationId = event.target.closest('[data-notification]')?.dataset.notification;
  if (notificationId) { await api(`/api/notifications/${notificationId}/read`,{method:'POST',body:{}}); await loadNotifications(); return; }
  if (event.target.closest('[data-edit-profile]')) return openEditProfile();
  if (event.target.closest('[data-load-more]')) return loadFeed(false);
  if (event.target.closest('[data-connect-stripe]')) {
    const data = await api('/api/billing/connect/onboard',{method:'POST',body:{}});
    location.href = data.url;
    return;
  }
  if (event.target.closest('[data-studio-action]')) return showToast('Éditeur avancé Studio : prochaine couche après le pipeline média réel');
  if (event.target.closest('[data-logout]')) {
    await api('/api/auth/logout',{method:'POST',body:{}});
    await window.YouFaceIdentity?.signOut?.().catch(() => {});
    state.user=null;state.csrf=null;state.sessionToken=null;state.phoneCodeSent=false;closeEvents();render();
  }
}
app.addEventListener('click', event => { handleClick(event).catch(handleError); });

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  try {
if (form.matches('[data-gmail-auth]')) {
  const fd = new FormData(form);
  const action = event.submitter?.dataset.gmailAction || 'login';
  const email = String(fd.get('email')).trim();
  const password = String(fd.get('password'));
  if (action === 'register') {
    const result = await window.YouFaceIdentity.signUpGmail(email, password);
    if (result?.verificationRequired) {
      form.reset();
      showToast('Compte Gmail créé — vérifie ton adresse Gmail puis connecte-toi');
      return;
    }
  }
  const idToken = await window.YouFaceIdentity.signInGmail(email, password);
  await exchangeIdentity(idToken);
  return;
}
if (form.matches('[data-phone-start]')) {
  const fd = new FormData(form);
  const result = await window.YouFaceIdentity.startPhone(String(fd.get('phone')).trim());
  if (result?.completed && result.idToken) { await exchangeIdentity(result.idToken); return; }
  state.phoneCodeSent = true; render(); return;
}
if (form.matches('[data-phone-confirm]')) {
  const fd = new FormData(form);
  const idToken = await window.YouFaceIdentity.confirmPhone(String(fd.get('code')).trim());
  await exchangeIdentity(idToken); return;
}
    if (form.matches('[data-tip-form]')) {
      const fd=new FormData(form); const credits=Number(fd.get('credits'));
      await api(`/api/billing/creators/${form.dataset.creatorId}/tip`,{method:'POST',body:{credits}});
      modal.close(); showToast('Soutien enregistré'); await loadAnalytics(); return;
    }
    if (form.matches('[data-create-post]')) {
      const fd = new FormData(form);
      await api('/api/content/posts',{method:'POST',body:{body:fd.get('body'),visibility:'public'}});
      form.reset();await loadFeed(true);showToast('Publication créée');return;
    }
    if (form.matches('[data-comment-form]')) {
      const id=form.dataset.commentForm;const fd=new FormData(form);
      await api(`/api/content/${id}/comments`,{method:'POST',body:{body:fd.get('body')}});await loadFeed(true);state.commentsOpen.add(id);render();await loadComments(id);return;
    }
    if (form.matches('[data-upload-form]')) {
      const fd=new FormData(form);const file=fd.get('video');const errorEl=form.querySelector('[data-upload-error]');errorEl.textContent='Préparation de l’upload...';
      const init=await api('/api/media/uploads',{method:'POST',body:{filename:file.name,mimeType:file.type||'application/octet-stream',sizeBytes:file.size}});
      let data;
      if (init.direct) {
        errorEl.textContent='Upload direct vers le stockage média...';
        const uploaded=await fetch(init.uploadUrl,{method:'PUT',headers:init.headers,body:file});
        if (!uploaded.ok) throw new Error(`STORAGE_UPLOAD_${uploaded.status}`);
        data=await api(`/api/media/${init.id}/complete`,{method:'POST',body:{}});
      } else {
        errorEl.textContent='Upload local de développement...';
        data=await api('/api/media/upload',{method:'POST',body:fd});
      }
      modal.close();routeTo('videos');showToast(`Média ${data.status} — worker FFmpeg en attente`);return;
    }
    if (form.matches('[data-publish-video]')) {
      const fd=new FormData(form);
      await api('/api/content/videos',{method:'POST',body:{mediaAssetId:form.dataset.mediaId,title:fd.get('title'),body:fd.get('body'),type:fd.get('type'),visibility:'public'}});
      modal.close();await loadFeed(true);routeTo(fd.get('type')==='short'?'shorts':'videos');return;
    }
    if (form.matches('[data-message-form]')) {
      const fd=new FormData(form);await api(`/api/conversations/${state.activeConversation}/messages`,{method:'POST',body:{body:fd.get('body')}});form.reset();await loadMessages(state.activeConversation);return;
    }
    if (form.matches('[data-new-conversation-form]')) {
      const fd=new FormData(form);const data=await api('/api/conversations/direct',{method:'POST',body:{username:fd.get('username')}});modal.close();state.activeConversation=data.id;await loadConversations();await loadMessages(data.id);return;
    }
    if (form.matches('[data-profile-form]')) {
      const fd=new FormData(form);const profile=await api('/api/profiles/me',{method:'PATCH',body:Object.fromEntries(fd)});
      Object.assign(state.user,profile);modal.close();render();return;
    }
  } catch (error) {
    const errorEl=form.querySelector('[data-auth-error],[data-upload-error]');
    if (errorEl) errorEl.textContent=error.payload?.error||error.message; else handleError(error);
  }
});

window.addEventListener('hashchange',()=>{state.route=location.hash.slice(1)||'home';render();loadRoute().catch(handleError)});
boot().catch(handleError);
