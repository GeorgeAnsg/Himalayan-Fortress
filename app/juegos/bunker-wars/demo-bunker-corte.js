(() => {
  // ── Modo planos / arte / solo ─────────────────────────────────────
  document.body.classList.add('planos');
  if (location.search.includes('arte') || location.search.includes('solo'))
    document.body.classList.remove('planos');
  if (location.search.includes('solo')) document.body.classList.add('solo');

  // ── Selector de mapa ─────────────────────────────────────────────
  const mapas = { selva:'selva', nieve:'nieve', pantano:'pantano', magia:'magia', desierto:'desierto', himalaya:'himalaya' };
  const params = new URLSearchParams(location.search);
  let actual = params.get('mapa') || localStorage.getItem('mapa') || 'himalaya';

  function aplicarMapa(id) {
    actual = mapas[id] || 'himalaya';
    document.body.classList.toggle('mapa-himalaya', actual === 'himalaya');
    document.documentElement.style.setProperty('--mapa-url', actual === 'himalaya' ? 'none' : `url('img/mapas/mapa-${actual}.webp')`);
    localStorage.setItem('mapa', actual);
    document.querySelectorAll('#selector-mapa button').forEach(b => {
      b.classList.toggle('activo', b.dataset.mapa === actual);
    });
  }

  document.querySelectorAll('#selector-mapa button').forEach(b => {
    b.addEventListener('click', () => aplicarMapa(b.dataset.mapa));
  });

  aplicarMapa(actual);

  // ── Bloquear rotación (Android Chrome / PWA; en iOS solo funciona instalada) ──
  try { screen.orientation.lock('portrait').catch(() => {}); } catch(e) {}

  // ── Parallax: bg-clouds (lento, profundidad) + bottom-fog ──────
  const suelo = document.querySelector('.suelo');
  let raf = false;
  function parallax() {
    raf = false;
    const sy = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const t = max > 0 ? sy / max : 0;
    suelo?.style.setProperty('--py-clouds',   `${sy * 0.3}px`);
    suelo?.style.setProperty('--py-cloud',    `${sy * 0.2}px`);
    suelo?.style.setProperty('--py-cloud-sm', `${sy * -0.4}px`);
    suelo?.style.setProperty('--py-flags',    `${sy * 0.15}px`);
    suelo?.style.setProperty('--px-flags',    `${sy * -0.35}px`);
    suelo?.style.setProperty('--py-fog', `${(1 - t) * 40 + 50}px`);
  }
  addEventListener('scroll', () => {
    if (!raf) { raf = true; requestAnimationFrame(parallax); }
  }, { passive: true });
  parallax();
})();
