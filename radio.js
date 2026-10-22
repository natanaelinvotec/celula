/* Rádio Célula — radinho flutuante com o jingle do laboratório, logo acima do botão do WhatsApp.
   Os navegadores só deixam tocar som sozinho depois que a pessoa interage com o site.
   Por isso: tenta tocar ao abrir; se o navegador bloquear, começa no primeiro clique/toque/tecla na página.
   Se o visitante pausar, não volta a tocar sozinho até fechar a aba (sessionStorage). */
(function () {
  'use strict';
  if (window.__radioCelula) return;
  window.__radioCelula = true;

  var AUDIO = '/audio/jingle-celula.mp3';
  var VOLUME = 0.7;
  var CHAVE_PAUSA = 'radio-celula:pausado';
  var reduzirMov = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function lerPausa() { try { return sessionStorage.getItem(CHAVE_PAUSA) === '1'; } catch (e) { return false; } }
  function gravarPausa(v) { try { v ? sessionStorage.setItem(CHAVE_PAUSA, '1') : sessionStorage.removeItem(CHAVE_PAUSA); } catch (e) {} }

  var css = [
    '.rc{position:fixed;right:30px;bottom:104px;z-index:1001;display:flex;align-items:center;gap:10px;font-family:"Nunito",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}',
    '.rc-radio{position:relative;width:60px;height:60px;border:0;border-radius:50%;padding:0;cursor:pointer;color:#fff;',
    '  background:radial-gradient(circle at 30% 25%,#ef4444,#d31a21 55%,#a8141a);box-shadow:0 4px 15px rgba(0,0,0,.22);',
    '  display:grid;place-items:center;transition:transform .25s ease,box-shadow .25s ease}',
    '.rc-radio:hover{transform:scale(1.08)}',
    '.rc-radio:focus-visible{outline:3px solid #2563eb;outline-offset:3px}',
    '.rc-radio>svg{width:38px;height:38px;overflow:visible}',
    '.rc-badge{position:absolute;left:-3px;bottom:-3px;width:22px;height:22px;border-radius:50%;background:#fff;color:#d31a21;',
    '  display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.25)}',
    '.rc-radio .rc-badge svg{width:10px;height:10px}',
    '.rc .rc-onda,.rc .rc-eq rect{opacity:.35}',
    '.rc[data-estado="tocando"] .rc-onda{animation:rc-onda 1.4s ease-out infinite}',
    '.rc[data-estado="tocando"] .rc-onda.o2{animation-delay:.35s}',
    '.rc[data-estado="tocando"] .rc-eq rect{opacity:1;transform-box:fill-box;transform-origin:bottom;animation:rc-eq .9s ease-in-out infinite alternate}',
    '.rc[data-estado="tocando"] .rc-eq rect:nth-child(2){animation-delay:-.3s;animation-duration:.7s}',
    '.rc[data-estado="tocando"] .rc-eq rect:nth-child(3){animation-delay:-.6s;animation-duration:1.1s}',
    '.rc[data-estado="tocando"] .rc-radio>svg{animation:rc-danca 1.2s ease-in-out infinite}',
    '.rc[data-estado="aguardando"] .rc-radio{animation:rc-pulso 2s infinite}',
    '@keyframes rc-onda{0%{opacity:0;transform:scale(.6)}40%{opacity:1}100%{opacity:0;transform:scale(1.25)}}',
    '@keyframes rc-eq{from{transform:scaleY(.25)}to{transform:scaleY(1)}}',
    '@keyframes rc-danca{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}',
    '@keyframes rc-pulso{0%{box-shadow:0 0 0 0 rgba(211,26,33,.45)}70%{box-shadow:0 0 0 15px rgba(211,26,33,0)}100%{box-shadow:0 0 0 0 rgba(211,26,33,0)}}',
    '.rc-onda{transform-box:fill-box;transform-origin:left bottom}',
    '.rc-balao{position:relative;background:#fff;color:#1e1b4b;border-radius:14px;padding:8px 30px 9px 12px;min-width:150px;',
    '  box-shadow:0 6px 22px rgba(15,23,42,.18);opacity:0;transform:translateX(8px);pointer-events:none;transition:opacity .25s,transform .25s}',
    '.rc.mostrar .rc-balao,.rc:hover .rc-balao,.rc:focus-within .rc-balao{opacity:1;transform:none;pointer-events:auto}',
    '.rc-balao:after{content:"";position:absolute;right:-6px;top:50%;margin-top:-6px;border:6px solid transparent;border-right:0;border-left-color:#fff}',
    '.rc-titulo{display:flex;align-items:center;gap:6px;font-weight:800;font-size:13px;line-height:1.2;white-space:nowrap}',
    '.rc-ponto{width:7px;height:7px;border-radius:50%;background:#94a3b8;flex:none}',
    '.rc[data-estado="tocando"] .rc-ponto{background:#d31a21;animation:rc-pisca 1s steps(2) infinite}',
    '@keyframes rc-pisca{50%{opacity:.25}}',
    '.rc-status{display:block;font-size:12px;font-weight:600;color:#64748b;margin-top:2px;white-space:nowrap}',
    '.rc-barra{height:3px;border-radius:3px;background:#e0effe;margin-top:6px;overflow:hidden}',
    '.rc-barra i{display:block;height:100%;width:0;background:linear-gradient(90deg,#2563eb,#d31a21);border-radius:3px;transition:width .3s linear}',
    '.rc-fechar{position:absolute;top:4px;right:4px;width:22px;height:22px;border:0;border-radius:50%;background:transparent;color:#94a3b8;',
    '  font-size:17px;line-height:1;cursor:pointer;display:grid;place-items:center}',
    '.rc-fechar:hover{background:#f1f5f9;color:#334155}',
    '.rc-fechar:focus-visible{outline:2px solid #2563eb}',
    '.rc.oculto{display:none}',
    '@media (max-width:900px){.rc{right:20px;bottom:82px}.rc-radio{width:50px;height:50px}.rc-radio>svg{width:32px;height:32px}.rc-badge{width:20px;height:20px}}',
    '@media (prefers-reduced-motion:reduce){.rc *{animation:none!important;transition:none!important}.rc .rc-onda,.rc .rc-eq rect{opacity:1}}',
    '@media print{.rc{display:none}}',
  ].join('\n');

  var ICONE_PLAY = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.2v7.6L8.6 5z" fill="currentColor"/></svg>';
  var ICONE_PAUSA = '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="2" y="1.5" width="2.2" height="7" rx=".6" fill="currentColor"/><rect x="5.8" y="1.5" width="2.2" height="7" rx=".6" fill="currentColor"/></svg>';

  // radinho: antena com ondas, corpo, alto-falante, visor com equalizador e botões
  var RADIO = '<svg viewBox="0 0 40 40" aria-hidden="true">' +
    '<path class="rc-onda" d="M28.5 2.5a5 5 0 0 1 4 4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path class="rc-onda o2" d="M29 -1a9 9 0 0 1 7 7" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M11 14L26.5 5.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="5.2" r="1.9" fill="#fff"/>' +
    '<rect x="4" y="13.5" width="32" height="20" rx="5" fill="#fff"/>' +
    '<circle cx="13" cy="23.5" r="6" fill="#fde2e3"/>' +
    '<g fill="#d31a21"><circle cx="11" cy="21.5" r="1"/><circle cx="15" cy="21.5" r="1"/><circle cx="13" cy="23.5" r="1"/><circle cx="11" cy="25.5" r="1"/><circle cx="15" cy="25.5" r="1"/></g>' +
    '<rect x="21.5" y="17" width="11" height="7" rx="1.6" fill="#1e1b4b"/>' +
    '<g class="rc-eq" fill="#5eead4"><rect x="23.3" y="18.5" width="1.8" height="4.2" rx=".5"/><rect x="26.1" y="18.5" width="1.8" height="4.2" rx=".5"/><rect x="28.9" y="18.5" width="1.8" height="4.2" rx=".5"/></g>' +
    '<circle cx="24" cy="28.5" r="1.7" fill="#2563eb"/><circle cx="30" cy="28.5" r="1.7" fill="#d31a21"/>' +
    '<rect x="8" y="33" width="4" height="2.4" rx="1" fill="#fff"/><rect x="28" y="33" width="4" height="2.4" rx="1" fill="#fff"/>' +
    '</svg>';

  function montar() {
    var st = document.createElement('style');
    st.id = 'radio-celula-css';
    st.textContent = css;
    document.head.appendChild(st);

    var el = document.createElement('div');
    el.className = 'rc';
    el.setAttribute('data-estado', 'parado');
    el.innerHTML =
      '<div class="rc-balao" role="status" aria-live="polite">' +
        '<span class="rc-titulo"><span class="rc-ponto"></span>Rádio Célula</span>' +
        '<span class="rc-status">Jingle do laboratório</span>' +
        '<div class="rc-barra"><i></i></div>' +
        '<button type="button" class="rc-fechar" aria-label="Fechar o rádio">&times;</button>' +
      '</div>' +
      '<button type="button" class="rc-radio" aria-pressed="false" aria-label="Tocar o jingle do Laboratório Célula">' +
        RADIO + '<span class="rc-badge">' + ICONE_PLAY + '</span>' +
      '</button>';
    document.body.appendChild(el);
    return el;
  }

  function iniciar() {
    var el = montar();
    var btn = el.querySelector('.rc-radio');
    var badge = el.querySelector('.rc-badge');
    var status = el.querySelector('.rc-status');
    var barra = el.querySelector('.rc-barra i');
    var fecharBtn = el.querySelector('.rc-fechar');
    var timerBalao = null;

    var audio = new Audio();
    audio.preload = 'auto';
    audio.src = AUDIO;
    audio.volume = VOLUME;

    function mostrarBalao(ms) {
      el.classList.add('mostrar');
      clearTimeout(timerBalao);
      if (ms) timerBalao = setTimeout(function () { el.classList.remove('mostrar'); }, ms);
    }

    function estado(e, texto) {
      el.setAttribute('data-estado', e);
      var tocando = e === 'tocando';
      btn.setAttribute('aria-pressed', tocando ? 'true' : 'false');
      btn.setAttribute('aria-label', tocando ? 'Pausar o jingle do Laboratório Célula' : 'Tocar o jingle do Laboratório Célula');
      badge.innerHTML = tocando ? ICONE_PAUSA : ICONE_PLAY;
      status.textContent = texto;
    }

    function tocar() {
      var p = audio.play();
      if (p && p.then) {
        return p.then(function () { desarmar(); }, function () {
          // navegador bloqueou o som automático: espera o primeiro gesto do visitante
          estado('aguardando', 'Toque para ouvir ♪');
          mostrarBalao(6000);
          armar();
        });
      }
      return Promise.resolve();
    }

    // ---- primeiro gesto em qualquer lugar da página destrava o som ----
    var EVENTOS = ['pointerdown', 'touchend', 'keydown', 'click'];
    var armado = false;
    function aoPrimeiroGesto(ev) {
      if (el.contains(ev.target)) return;            // clique no próprio rádio é tratado pelo botão
      if (ev.type === 'keydown' && (ev.key === 'Escape' || ev.key === 'Tab')) return;
      if (lerPausa()) return desarmar();
      tocar();
    }
    function armar() {
      if (armado) return; armado = true;
      EVENTOS.forEach(function (t) { document.addEventListener(t, aoPrimeiroGesto, { capture: true, passive: true }); });
    }
    function desarmar() {
      if (!armado) return; armado = false;
      EVENTOS.forEach(function (t) { document.removeEventListener(t, aoPrimeiroGesto, { capture: true }); });
    }

    // ---- eventos do áudio ----
    audio.addEventListener('playing', function () {
      estado('tocando', 'Tocando agora');
      mostrarBalao(window.innerWidth <= 900 ? 4000 : 6000);
    });
    audio.addEventListener('pause', function () {
      if (!audio.ended) estado('parado', 'Pausado · toque para continuar');
    });
    audio.addEventListener('ended', function () {
      estado('parado', 'Ouvir de novo ♪');
      barra.style.width = '0';
      audio.currentTime = 0;
    });
    audio.addEventListener('timeupdate', function () {
      if (audio.duration) barra.style.width = (100 * audio.currentTime / audio.duration).toFixed(1) + '%';
    });
    audio.addEventListener('error', function () { el.classList.add('oculto'); desarmar(); });

    btn.addEventListener('click', function () {
      if (audio.paused) { gravarPausa(false); tocar(); }
      else { gravarPausa(true); audio.pause(); desarmar(); }
    });
    fecharBtn.addEventListener('click', function () {
      gravarPausa(true); audio.pause(); desarmar(); el.classList.add('oculto');
    });

    // controles na tela de bloqueio do celular / teclas de mídia
    if ('mediaSession' in navigator && window.MediaMetadata) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Jingle Laboratório Célula', artist: 'Célula Diagnósticos', album: 'Rádio Célula',
          artwork: [{ src: '/img/favicon.png', sizes: '192x192', type: 'image/png' }],
        });
      } catch (e) {}
    }

    if (lerPausa()) { estado('parado', 'Toque para ouvir ♪'); return; }
    estado('parado', 'Jingle do laboratório');
    tocar();
  }

  // só começa depois que a página carregou (não atrasa o site)
  function quandoPronto() { setTimeout(iniciar, reduzirMov ? 0 : 600); }
  if (document.readyState === 'complete') quandoPronto();
  else window.addEventListener('load', quandoPronto);
})();
