window.addEventListener('error', function (e) {
  var root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="max-width:500px;margin:60px auto;padding:20px;font-family:sans-serif;color:#eee;background:#171b26;border:1px solid #ff6c6c;border-radius:12px;">' +
      '<h3 style="margin-top:0;color:#ff6c6c;">Something broke while loading</h3>' +
      '<pre style="white-space:pre-wrap;font-size:12px;color:#ffb3b3;">' +
      (e.message || 'Unknown error') + (e.filename ? ('\n' + e.filename + ':' + e.lineno) : '') +
      '</pre></div>';
  }
});
window.addEventListener('unhandledrejection', function (e) {
  var root = document.getElementById('root');
  if (root && !root.querySelector('h3')) {
    root.innerHTML = '<div style="max-width:500px;margin:60px auto;padding:20px;font-family:sans-serif;color:#eee;background:#171b26;border:1px solid #ff6c6c;border-radius:12px;">' +
      '<h3 style="margin-top:0;color:#ff6c6c;">Something broke while loading</h3>' +
      '<pre style="white-space:pre-wrap;font-size:12px;color:#ffb3b3;">' +
      (e.reason && e.reason.message ? e.reason.message : String(e.reason)) +
      '</pre></div>';
  }
});

(function () {
  const root = document.getElementById('root');
  const DB_NAME = 'fileLockerMultiUserDB';
  const DB_VERSION = 1;
  const OWNER_USERNAME = 'anshith';
  const OWNER_DISPLAY_NAME = 'Anshith';
  const OWNER_PASSWORD = 'Anshith@17';
  let db = null;
  let currentUser = null; // { username, displayName, role: 'owner' | 'moderator' | 'member' }

  // ---------- IndexedDB helpers ----------

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('users')) {
          database.createObjectStore('users', { keyPath: 'username' });
        }
        if (!database.objectStoreNames.contains('files')) {
          const store = database.createObjectStore('files', { keyPath: 'id' });
          store.createIndex('owner', 'owner', { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error || new Error('Could not open storage'));
    });
  }

  function tx(storeName, mode) { return db.transaction(storeName, mode).objectStore(storeName); }

  function idbGet(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readonly').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  function idbPut(storeName, value) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  function idbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  function idbGetAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGetAllByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readonly').index(indexName).getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------- Utilities ----------

  function toast(msg) {
    let t = document.getElementById('lk-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'lk-toast';
      t.className = 'lk-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.classList.remove('show'); }, 2400);
  }

  function simpleHash(text) {
    let h1 = 0xdeadbeef ^ text.length;
    let h2 = 0x41c6ce57 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function formatDateTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return new Date(iso).toLocaleString();
    }
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function fileIcon(type) {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📕';
    if (type.includes('zip') || type.includes('compressed')) return '🗜️';
    return '📄';
  }
  function shakeError(el) {
    el.classList.remove('lk-shake');
    void el.offsetWidth;
    el.classList.add('lk-shake');
  }
  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.classList.toggle('lk-loading', loading);
  }
  function fadeSwap(html) {
    root.style.animation = 'none';
    void root.offsetWidth;
    root.innerHTML = html;
  }

  function showConfirmModal({ title, message, confirmLabel, onConfirm }) {
    const overlay = document.createElement('div');
    overlay.className = 'lk-modal-overlay';
    overlay.innerHTML = `
      <div class="lk-modal-card">
        <p class="lk-modal-title">${escapeHtml(title)}</p>
        <p class="lk-modal-message">${escapeHtml(message)}</p>
        <div class="lk-modal-actions">
          <button class="lk-btn lk-btn-secondary" id="lk-modal-cancel">Cancel</button>
          <button class="lk-btn lk-modal-danger" id="lk-modal-confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#lk-modal-cancel').addEventListener('click', close);
    overlay.querySelector('#lk-modal-confirm').addEventListener('click', async () => {
      const btn = overlay.querySelector('#lk-modal-confirm');
      setLoading(btn, true);
      try {
        await onConfirm();
        close();
      } catch (e) {
        setLoading(btn, false);
      }
    });
  }

  async function ensureOwnerAccount() {
    const existing = await idbGet('users', OWNER_USERNAME);
    if (!existing) {
      await idbPut('users', {
        username: OWNER_USERNAME,
        displayName: OWNER_DISPLAY_NAME,
        hash: simpleHash(OWNER_PASSWORD),
        role: 'owner',
        status: 'approved',
        createdAt: new Date().toISOString()
      });
    }
  }

  // ---------- Screens ----------

  async function renderHome() {
    fadeSwap(`
      <div class="lk-center">
        <div class="lk-card">
          <div class="lk-logo">🔐</div>
          <p class="lk-title">Welcome back</p>
          <p class="lk-sub">Log in to your personal file locker.</p>
          <input id="lk-username" class="lk-input" type="text" placeholder="Username" autocomplete="username" />
          <input id="lk-password" class="lk-input" type="password" placeholder="Password" autocomplete="current-password" />
          <p class="lk-error" id="lk-err"></p>
          <button class="lk-btn" id="lk-login">Log In</button>
          <button class="lk-link-btn" id="lk-goto-signup">New here? Create an account</button>
        </div>
      </div>
    `);

    const errEl = document.getElementById('lk-err');
    const loginBtn = document.getElementById('lk-login');
    const uEl = document.getElementById('lk-username');
    const pEl = document.getElementById('lk-password');

    async function doLogin() {
      const username = uEl.value.trim();
      const password = pEl.value;
      errEl.textContent = '';
      if (!username || !password) { errEl.textContent = 'Enter your username and password.'; shakeError(errEl); return; }

      setLoading(loginBtn, true);
      try {
        const user = await idbGet('users', username.toLowerCase());
        if (!user || simpleHash(password) !== user.hash) {
          errEl.textContent = 'Incorrect username or password.';
          shakeError(errEl);
          setLoading(loginBtn, false);
          return;
        }
        if (user.status === 'pending') {
          errEl.textContent = 'Your account is still waiting for approval.';
          shakeError(errEl);
          setLoading(loginBtn, false);
          return;
        }
        currentUser = { username: user.username, displayName: user.displayName, role: user.role === 'owner' ? 'owner' : (user.role === 'moderator' ? 'moderator' : 'member') };
        renderLocker();
      } catch (e) {
        errEl.textContent = 'Something went wrong. Try again.';
        setLoading(loginBtn, false);
      }
    }

    loginBtn.addEventListener('click', doLogin);
    pEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('lk-goto-signup').addEventListener('click', renderSignup);
  }

  function renderSignup() {
    fadeSwap(`
      <div class="lk-center">
        <div class="lk-card">
          <div class="lk-logo">✨</div>
          <p class="lk-title">Create an account</p>
          <p class="lk-sub">Your request goes to the locker owner for approval before you can log in.</p>
          <input id="lk-username" class="lk-input" type="text" placeholder="Choose a username" autocomplete="username" />
          <input id="lk-password" class="lk-input" type="password" placeholder="Choose a password" autocomplete="new-password" />
          <input id="lk-password2" class="lk-input" type="password" placeholder="Confirm password" />
          <p class="lk-error" id="lk-err"></p>
          <button class="lk-btn" id="lk-request">Request Access</button>
          <button class="lk-link-btn" id="lk-back">Back to log in</button>
        </div>
      </div>
    `);

    document.getElementById('lk-back').addEventListener('click', renderHome);
    const errEl = document.getElementById('lk-err');
    const btn = document.getElementById('lk-request');

    btn.addEventListener('click', async () => {
      const username = document.getElementById('lk-username').value.trim();
      const password = document.getElementById('lk-password').value;
      const password2 = document.getElementById('lk-password2').value;
      errEl.textContent = '';

      if (!username || username.length < 2) { errEl.textContent = 'Choose a username (2+ characters).'; shakeError(errEl); return; }
      if (password.length < 4) { errEl.textContent = 'Use a password with 4+ characters.'; shakeError(errEl); return; }
      if (password !== password2) { errEl.textContent = 'Passwords do not match.'; shakeError(errEl); return; }

      setLoading(btn, true);
      try {
        const existing = await idbGet('users', username.toLowerCase());
        if (existing) {
          errEl.textContent = 'That username is already taken.';
          shakeError(errEl);
          setLoading(btn, false);
          return;
        }
        await idbPut('users', {
          username: username.toLowerCase(),
          displayName: username,
          hash: simpleHash(password),
          role: 'member',
          status: 'pending',
          createdAt: new Date().toISOString()
        });

        fadeSwap(`
          <div class="lk-center">
            <div class="lk-card">
              <div class="lk-logo">📨</div>
              <p class="lk-title">Request sent</p>
              <p class="lk-sub">Your account request has been sent to the locker owner. It'll be ready once they approve it from the Admin panel.</p>
              <button class="lk-btn" id="lk-back2">Back to log in</button>
            </div>
          </div>
        `);
        document.getElementById('lk-back2').addEventListener('click', renderHome);
      } catch (e) {
        errEl.textContent = 'Could not send request. Try again.';
        setLoading(btn, false);
      }
    });
  }

  async function renderLocker() {
    const initials = currentUser.displayName.slice(0, 2).toUpperCase();
    const roleTag = currentUser.role === 'owner'
      ? '<span class="lk-tag lk-tag-admin">Owner</span>'
      : currentUser.role === 'moderator'
        ? '<span class="lk-tag lk-tag-mod">Moderator</span>'
        : '';
    fadeSwap(`
      <div class="lk-topbar">
        <div class="lk-user-badge">
          <div class="lk-avatar">${initials}</div>
          <div>
            <div style="font-size:14px;font-weight:600;">${escapeHtml(currentUser.displayName)}${roleTag}</div>
          </div>
        </div>
        <div class="lk-topbar-actions">
          ${currentUser.role === 'owner' || currentUser.role === 'moderator' ? '<button class="lk-btn lk-btn-secondary" id="lk-admin" style="width:auto;padding:8px 14px;font-size:13px;">Admin</button>' : ''}
          ${currentUser.role === 'owner' ? '<button class="lk-btn lk-btn-secondary" id="lk-accounts" style="width:auto;padding:8px 14px;font-size:13px;">Accounts</button>' : ''}
          <button class="lk-btn lk-btn-secondary" id="lk-logout" style="width:auto;padding:8px 14px;font-size:13px;">Log out</button>
        </div>
      </div>
      <div class="lk-app">
        <label class="lk-drop" id="lk-drop" for="lk-file-input">
          <div class="lk-drop-icon">📤</div>
          <div>Tap to choose a file, or drag one here</div>
          <div style="font-size:11px;margin-top:6px;">Stored privately in your account on this device</div>
        </label>
        <input type="file" id="lk-file-input" class="lk-file-input-hidden" multiple />
        <div class="lk-progress" id="lk-progress" style="display:none;"></div>
        <div id="lk-file-list"></div>
      </div>
    `);

    document.getElementById('lk-logout').addEventListener('click', () => { currentUser = null; renderHome(); });
    if (currentUser.role === 'owner' || currentUser.role === 'moderator') {
      document.getElementById('lk-admin').addEventListener('click', renderAdmin);
    }
    if (currentUser.role === 'owner') {
      document.getElementById('lk-accounts').addEventListener('click', renderAccounts);
    }

    const dropEl = document.getElementById('lk-drop');
    const inputEl = document.getElementById('lk-file-input');
    dropEl.addEventListener('dragover', (e) => { e.preventDefault(); dropEl.classList.add('lk-drag'); });
    dropEl.addEventListener('dragleave', () => dropEl.classList.remove('lk-drag'));
    dropEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dropEl.classList.remove('lk-drag');
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    inputEl.addEventListener('change', (e) => {
      if (e.target.files.length) handleFiles(e.target.files);
      inputEl.value = '';
    });

    await renderFileList();
  }

  async function handleFiles(fileList) {
    const progressEl = document.getElementById('lk-progress');
    const files = Array.from(fileList);
    for (const file of files) {
      progressEl.style.display = 'flex';
      progressEl.innerHTML = `<div class="lk-spinner"></div><span>Saving ${escapeHtml(file.name)}...</span>`;
      try {
        const id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await idbPut('files', {
          id, owner: currentUser.username, name: file.name, size: file.size,
          type: file.type || 'application/octet-stream',
          date: new Date().toISOString(), blob: file
        });
      } catch (e) {
        toast(`Failed to save "${file.name}"`);
      }
    }
    progressEl.style.display = 'none';
    await renderFileList();
    toast('Saved');
  }

  async function renderFileList() {
    const listEl = document.getElementById('lk-file-list');
    let files = [];
    try {
      files = await idbGetAllByIndex('files', 'owner', currentUser.username);
    } catch (e) {
      listEl.innerHTML = '<div class="lk-empty">Could not load files.</div>';
      return;
    }
    if (files.length === 0) {
      listEl.innerHTML = '<div class="lk-empty">No files yet. Upload something above.</div>';
      return;
    }
    files.sort((a, b) => new Date(b.date) - new Date(a.date));
    listEl.innerHTML = files.map((f, i) => `
      <div class="lk-file-row" data-id="${f.id}" style="animation-delay:${i * 0.03}s">
        <div class="lk-file-info">
          <div class="lk-file-icon">${fileIcon(f.type)}</div>
          <div style="min-width:0;">
            <div class="lk-file-name">${escapeHtml(f.name)}</div>
            <div class="lk-file-meta">${fmtSize(f.size)} · ${new Date(f.date).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="lk-file-actions">
          <button class="lk-icon-btn lk-open" data-id="${f.id}">Open</button>
          <button class="lk-icon-btn lk-download" data-id="${f.id}">Download</button>
          <button class="lk-icon-btn lk-del" data-id="${f.id}">Delete</button>
        </div>
      </div>
    `).join('');
    listEl.querySelectorAll('.lk-open').forEach(btn => btn.addEventListener('click', () => openFile(btn.dataset.id)));
    listEl.querySelectorAll('.lk-download').forEach(btn => btn.addEventListener('click', () => downloadFile(btn.dataset.id)));
    listEl.querySelectorAll('.lk-del').forEach(btn => btn.addEventListener('click', () => deleteFile(btn.dataset.id)));
  }

  async function openFile(id) {
    try {
      const record = await idbGet('files', id);
      if (!record) throw new Error('Not found');
      const url = URL.createObjectURL(record.blob);
      const win = window.open(url, '_blank');
      if (!win) {
        toast('Your browser blocked the popup — allow popups to open files');
      }
      // Give the new tab time to load the blob before we release it.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast('Could not open that file');
    }
  }

  async function downloadFile(id) {
    try {
      const record = await idbGet('files', id);
      if (!record) throw new Error('Not found');
      const url = URL.createObjectURL(record.blob);
      const a = document.createElement('a');
      a.href = url; a.download = record.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast('Could not download that file');
    }
  }

  async function deleteFile(id) {
    const row = document.querySelector(`.lk-file-row[data-id="${id}"]`);
    if (row) row.classList.add('lk-removing');
    try {
      await new Promise(r => setTimeout(r, 150));
      await idbDelete('files', id);
      await renderFileList();
      toast('File deleted');
    } catch (e) {
      toast('Could not delete that file');
    }
  }

  async function renderAdmin() {
    if (currentUser.role !== 'owner' && currentUser.role !== 'moderator') { renderLocker(); return; }
    const users = await idbGetAll('users');
    const pending = users.filter(u => u.status === 'pending');

    fadeSwap(`
      <div class="lk-topbar">
        <p class="lk-title" style="margin:0;">Admin · Pending Requests</p>
        <button class="lk-btn lk-btn-secondary" id="lk-back-locker" style="width:auto;padding:8px 14px;font-size:13px;">Back</button>
      </div>
      <div class="lk-app">
        <div id="lk-pending-list"></div>
      </div>
    `);

    document.getElementById('lk-back-locker').addEventListener('click', renderLocker);

    const pendingListEl = document.getElementById('lk-pending-list');
    if (pending.length === 0) {
      pendingListEl.innerHTML = '<div class="lk-empty">No pending requests.</div>';
    } else {
      pendingListEl.innerHTML = pending.map(u => `
        <div class="lk-pending-row" data-username="${u.username}">
          <div>
            <div class="lk-pending-name">${escapeHtml(u.displayName)}<span class="lk-tag lk-tag-pending">Pending</span></div>
            <div class="lk-pending-date">Requested ${formatDateTime(u.createdAt)}</div>
          </div>
          <div class="lk-pending-actions">
            <button class="lk-icon-btn lk-approve" data-username="${u.username}" data-action="approved">Approve</button>
            <button class="lk-icon-btn lk-reject" data-username="${u.username}" data-action="rejected">Reject</button>
          </div>
        </div>
      `).join('');
      pendingListEl.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.dataset.action === 'approved') {
            const user = await idbGet('users', btn.dataset.username);
            if (!user) return;
            user.status = 'approved';
            await idbPut('users', user);
            toast('Account approved');
          } else {
            // Reject = remove the request entirely, freeing the username for reuse.
            await idbDelete('users', btn.dataset.username);
            toast('Request rejected and username freed');
          }
          renderAdmin();
        });
      });
    }
  }

  async function renderAccounts() {
    if (currentUser.role !== 'owner') { renderLocker(); return; }
    fadeSwap(`
      <div class="lk-topbar">
        <p class="lk-title" style="margin:0;">Accounts</p>
        <button class="lk-btn lk-btn-secondary" id="lk-back-locker" style="width:auto;padding:8px 14px;font-size:13px;">Back</button>
      </div>
      <div class="lk-app">
        <input id="lk-account-search" class="lk-input" type="text" placeholder="Search by username..." />
        <div id="lk-accounts-list"></div>
      </div>
    `);

    document.getElementById('lk-back-locker').addEventListener('click', renderLocker);
    const searchEl = document.getElementById('lk-account-search');

    async function renderList(query) {
      const listEl = document.getElementById('lk-accounts-list');
      let users = [];
      try {
        users = await idbGetAll('users');
      } catch (e) {
        listEl.innerHTML = '<div class="lk-empty">Could not load accounts.</div>';
        return;
      }
      const q = (query || '').trim().toLowerCase();
      const filtered = users
        .filter(u => !q || u.username.includes(q) || u.displayName.toLowerCase().includes(q))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="lk-empty">No matching accounts.</div>';
        return;
      }

      listEl.innerHTML = filtered.map((u, i) => {
        const isOwner = u.role === 'owner';
        const isMod = u.role === 'moderator';
        const tag = isOwner ? '<span class="lk-tag lk-tag-admin">Owner</span>'
          : isMod ? '<span class="lk-tag lk-tag-mod">Moderator</span>' : '';
        const statusTag = u.status === 'pending' ? '<span class="lk-tag lk-tag-pending">Pending</span>' : '';
        return `
          <div class="lk-account-row" style="animation-delay:${i * 0.02}s">
            <div class="lk-pending-name" style="display:flex;align-items:center;gap:10px;">
              <div class="lk-avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0;">${escapeHtml(u.displayName.slice(0, 2).toUpperCase())}</div>
              <div>
                <div>${escapeHtml(u.displayName)}${tag}${statusTag}</div>
                <div class="lk-pending-date">Created ${formatDateTime(u.createdAt)}</div>
              </div>
            </div>
            <div class="lk-pending-actions">
              ${!isOwner && u.status === 'approved' ? `<button class="lk-icon-btn lk-mod-toggle" data-username="${u.username}" data-tomod="${!isMod}">${isMod ? 'Remove Mod' : 'Make Moderator'}</button>` : ''}
              ${!isOwner ? `<button class="lk-icon-btn lk-del-account" data-username="${u.username}" data-name="${escapeHtml(u.displayName)}">Delete</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.lk-mod-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
          const user = await idbGet('users', btn.dataset.username);
          if (!user) return;
          user.role = btn.dataset.tomod === 'true' ? 'moderator' : 'member';
          await idbPut('users', user);
          toast(user.role === 'moderator' ? 'Now a moderator' : 'Moderator removed');
          renderList(searchEl.value);
        });
      });

      listEl.querySelectorAll('.lk-del-account').forEach(btn => {
        btn.addEventListener('click', () => {
          showConfirmModal({
            title: 'Delete this account?',
            message: `This permanently deletes "${btn.dataset.name}" and all of their stored files. The username becomes free to use again. This can't be undone.`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
              const files = await idbGetAllByIndex('files', 'owner', btn.dataset.username);
              for (const f of files) await idbDelete('files', f.id);
              await idbDelete('users', btn.dataset.username);
              toast('Account deleted');
              renderList(searchEl.value);
            }
          });
        });
      });
    }

    searchEl.addEventListener('input', () => renderList(searchEl.value));
    await renderList('');
  }

  // ---------- Init ----------

  (async function init() {
    try {
      db = await openDB();
      await ensureOwnerAccount();
      renderHome();
    } catch (e) {
      root.innerHTML = `
        <div class="lk-center">
          <div class="lk-card">
            <p class="lk-title">Can't start locker</p>
            <p class="lk-sub">This browser blocked local storage access. Try opening this file in a standard browser like Chrome or Safari instead of an in-app preview.</p>
          </div>
        </div>
      `;
    }
  })();
})();
