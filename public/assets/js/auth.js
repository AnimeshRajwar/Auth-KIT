'use strict';
 
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle(
      'active',
      (i === 0 && tab === 'login') || (i === 1 && tab === 'register')
    );
  });
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}
 
async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');
  errEl.classList.add('hidden');
 
  if (!email || !password) { showError(errEl, 'Please fill in all fields.'); return; }
 
  setBtnLoading(btn, true, 'Signing in...');
  const res  = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  setBtnLoading(btn, false, 'Sign In');
 
  if (!res.ok) { showError(errEl, data.message || data.error || 'Login failed'); return; }
 
  accessToken  = data.access_token;
  refreshToken = data.refresh_token;
  localStorage.setItem('ak_access',  accessToken);
  localStorage.setItem('ak_refresh', refreshToken);
  currentUser = data.user;
  enterApp();
}
 
async function doRegister() {
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('register-error');
  const btn      = document.getElementById('register-btn');
  errEl.classList.add('hidden');
 
  if (!email || !password) { showError(errEl, 'Please fill in all fields.'); return; }
 
  setBtnLoading(btn, true, 'Creating account...');
  const res  = await fetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  setBtnLoading(btn, false, 'Create Account');
 
  if (!res.ok) { showError(errEl, data.message || data.error || 'Registration failed'); return; }
 
  // Auto-login after registration
  document.getElementById('login-email').value    = email;
  document.getElementById('login-password').value = password;
  switchTab('login');
  await doLogin();
}
 
function forceLogout() {
  stopUserCountAutoRefresh();
  closeMobileSidebar();
  accessToken  = null;
  refreshToken = null;
  currentUser  = null;
  localStorage.removeItem('ak_access');
  localStorage.removeItem('ak_refresh');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display  = 'none';
}
 
async function doLogout() {
  if (refreshToken) {
    await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {});
  }
  forceLogout();
}
 
async function enterApp() {
  if (!currentUser) {
    const { ok, data } = await api('GET', '/auth/me');
    if (!ok) { forceLogout(); return; }
    currentUser = data.user;
  }
 
  document.getElementById('auth-screen').style.display            = 'none';
  document.getElementById('app-screen').style.display             = 'block';
  document.getElementById('user-email-display').textContent       = currentUser.email;
  document.getElementById('user-avatar').textContent              = currentUser.email[0].toUpperCase();
  document.getElementById('stat-email').textContent               = currentUser.email.split('@')[0];
 
  showPage('dashboard');
}
 