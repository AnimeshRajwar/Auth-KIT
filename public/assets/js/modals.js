
'use strict';

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) closeModal(el.id);
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id));
    return;
  }

  if (e.key === 'Enter') {
    const activeModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (activeModal) return; // let the modal handle its own submit

    const loginForm = document.getElementById('login-form');
    const regForm   = document.getElementById('register-form');
    if (!loginForm.classList.contains('hidden')) doLogin();
    if (!regForm.classList.contains('hidden'))   doRegister();
  }
});