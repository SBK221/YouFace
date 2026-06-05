// Page navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const page = item.dataset.page;

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(`page-${page}`)?.classList.add('active');
  });
});

// Filter tabs (Expertise)
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    tab.closest('.filter-tabs').querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// Profile tabs
document.querySelectorAll('.profile-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    tab.closest('.profile-tabs').querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// Follow toggle
document.querySelectorAll('.btn-follow').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('following')) {
      btn.classList.remove('following');
      btn.textContent = '+ Suivre';
    } else {
      btn.classList.add('following');
      btn.textContent = '✓ Suivi';
    }
  });
});

// Like toggle
document.querySelectorAll('.btn-action').forEach(btn => {
  if (btn.textContent.includes('❤️')) {
    btn.addEventListener('click', () => btn.classList.toggle('liked'));
  }
});

// Save toggle
document.querySelectorAll('.btn-save').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.textContent = btn.textContent.includes('Sauvegarder') ? '🔖 Sauvegardé' : '🔖 Sauvegarder';
  });
});
