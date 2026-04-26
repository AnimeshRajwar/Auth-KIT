'use strict';
 
async function api(method, path, body) {
  const headers = {};
  const hasBody = body !== undefined && body !== null;
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
 
  const res = await fetch(path, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
 
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      const res2 = await fetch(path, {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
      });
      const data2 = await res2.json().catch(() => ({}));
      return { ok: res2.ok, status: res2.status, data: data2 };
    } else {
      forceLogout();
      return { ok: false, status: 401, data };
    }
  }
 
  return { ok: res.ok, status: res.status, data };
}
 
async function tryRefresh() {
  if (!refreshToken) return false;
  const res = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) { forceLogout(); return false; }
  const data = await res.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  localStorage.setItem('ak_access', accessToken);
  localStorage.setItem('ak_refresh', refreshToken);
  return true;
}
 
// ─── Shared UI helpers ──────────────────────────────────
 
function isMobileViewport() {
  return window.matchMedia('(max-width: 767px)').matches;
}
 
function toggleMobileSidebar() {
  if (!isMobileViewport()) return;
  document.body.classList.toggle('mobile-sidebar-open');
}
 
function closeMobileSidebar() {
  document.body.classList.remove('mobile-sidebar-open');
}
 
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}
 
function setBtnLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${label}` : label;
}
 
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
 
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
 
function fmtDateFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
 
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
 