
'use strict';

function initDocs() {
  const sections    = document.querySelectorAll('#page-docs .docs-section');
  const links       = document.querySelectorAll('.docs-nav-link');
  const lastSection = sections[sections.length - 1];

  const updateActiveLink = () => {
    let current = sections[0]?.id || '';
    const scrollPosition = window.scrollY + 80;

    sections.forEach(s => {
      if (scrollPosition >= s.offsetTop) current = s.id;
    });

    const nearBottom =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 24;
    if (nearBottom && lastSection) current = lastSection.id;

    links.forEach(l => {
      const href = l.getAttribute('href')?.replace('#', '');
      l.classList.toggle('active', href === current);
    });
  };

  // Register listeners only once
  if (!window._docsSpyInit) {
    window._docsSpyInit = true;
    window.addEventListener('scroll', updateActiveLink, { passive: true });
    window.addEventListener('resize', updateActiveLink, { passive: true });
  }

  updateActiveLink();

  // Smooth-scroll sidebar links
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id     = link.getAttribute('href')?.replace('#', '');
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function switchCodeTab(group, tab) {
  // Hide all panels whose id begins with `group-`
  document.querySelectorAll(`[id^="${group}-"]`).forEach(p => p.classList.add('hidden'));

  // Deactivate all buttons in the tab bar
  const tabBar = document.getElementById(`${group}-tabs`);
  tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  // Show selected panel
  const panel = document.getElementById(`${group}-${tab}`);
  if (panel) panel.classList.remove('hidden');

  // Activate the matching button
  tabBar.querySelectorAll('.tab-btn').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${tab}'`)) b.classList.add('active');
  });
}