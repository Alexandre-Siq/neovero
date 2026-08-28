/*
 * Modo "aprender": o usuário clica no botão/campo real do Neovero e gravamos o
 * seletor CSS correspondente. É a saída quando a heurística por texto não acha
 * o elemento (por exemplo botões que só têm ícone).
 */
(function (NV) {
  'use strict';

  const dom = NV.dom;
  const aprender = {};

  let ativo = null;

  /* Entra nos iframes de mesma origem: as janelas da OS podem estar dentro deles. */
  function elementoNoPonto(x, y) {
    let el = document.elementFromPoint(x, y);
    let deslocX = 0;
    let deslocY = 0;
    for (let n = 0; n < 3 && el && (el.tagName === 'IFRAME' || el.tagName === 'FRAME'); n += 1) {
      const interno = dom.documentoDoFrame(el);
      if (!interno) break;
      const r = el.getBoundingClientRect();
      deslocX += r.left;
      deslocY += r.top;
      const dentro = interno.elementFromPoint(x - deslocX, y - deslocY);
      if (!dentro) break;
      el = dentro;
    }
    return el;
  }

  function criarCamada() {
    const camada = document.createElement('div');
    camada.setAttribute('data-nv-ui', 'aprender');
    camada.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483000',
      'pointer-events:none'
    ].join(';');

    const realce = document.createElement('div');
    realce.style.cssText = [
      'position:fixed',
      'border:2px solid #f5c542',
      'background:rgba(245,197,66,.18)',
      'border-radius:4px',
      'transition:all .05s linear',
      'pointer-events:none'
    ].join(';');

    const dica = document.createElement('div');
    dica.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:16px',
      'transform:translateX(-50%)',
      'background:#1b1f24',
      'color:#fff',
      'font:600 13px/1.4 system-ui,Segoe UI,sans-serif',
      'padding:10px 16px',
      'border-radius:999px',
      'box-shadow:0 6px 24px rgba(0,0,0,.4)',
      'pointer-events:none',
      'max-width:80vw',
      'text-align:center'
    ].join(';');

    camada.appendChild(realce);
    camada.appendChild(dica);
    document.body.appendChild(camada);
    return { camada: camada, realce: realce, dica: dica };
  }

  aprender.ativo = function () {
    return !!ativo;
  };

  aprender.cancelar = function () {
    if (!ativo) return;
    ativo.limpar();
    ativo = null;
  };

  /* Resolve com o seletor gravado, ou null se o usuário cancelar. */
  aprender.iniciar = function (chave, rotuloAmigavel) {
    if (ativo) aprender.cancelar();

    return new Promise(function (resolve) {
      const ui = criarCamada();
      ui.dica.textContent = 'Clique em: ' + (rotuloAmigavel || chave) + '  ·  Esc para cancelar';

      const aoMover = function (ev) {
        const el = elementoNoPonto(ev.clientX, ev.clientY);
        if (!el || el.closest('[data-nv-ui]')) return;
        const r = dom.retanguloAbsoluto(el);
        ui.realce.style.left = r.left + 'px';
        ui.realce.style.top = r.top + 'px';
        ui.realce.style.width = r.width + 'px';
        ui.realce.style.height = r.height + 'px';
      };

      const finalizar = function (resultado) {
        limpar();
        ativo = null;
        resolve(resultado);
      };

      const aoClicar = function (ev) {
        const el = elementoNoPonto(ev.clientX, ev.clientY);
        if (!el || el.closest('[data-nv-ui]')) return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        const alvo = dom.alvoClicavel(el, 2) || el;
        const caminho = dom.caminhoCss(alvo);
        NV.config.definirSeletor(chave, caminho);
        NV.log.info('Seletor aprendido', { chave: chave, seletor: caminho, elemento: dom.descrever(alvo) });
        finalizar({ chave: chave, seletor: caminho, descricao: dom.descrever(alvo) });
      };

      const aoTeclar = function (ev) {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          finalizar(null);
        }
      };

      const desligarMover = dom.ouvirTodos('mousemove', aoMover, true);
      const desligarClique = dom.ouvirTodos('click', aoClicar, true);
      const desligarTecla = dom.ouvirTodos('keydown', aoTeclar, true);

      const limpar = function () {
        desligarMover();
        desligarClique();
        desligarTecla();
        ui.camada.remove();
      };

      ativo = { limpar: limpar };
    });
  };

  NV.aprender = aprender;
})((globalThis.NV = globalThis.NV || {}));
