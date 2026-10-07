/*
 * Botão "fechar" que aparece sobre a linha do Monitor de Atendimento quando o
 * mouse passa por ela.
 *
 * De propósito não injeta nada no DOM da aplicação: o botão é um elemento flutuante
 * nosso, posicionado sobre a linha. Assim nenhuma re-renderização do Neovero perde
 * o botão nem tem o layout alterado.
 */
(function (NV) {
  'use strict';

  const dom = NV.dom;
  const lista = {};

  let host = null;
  let botao = null;
  let itemAtual = null;
  let ultimoMovimento = 0;
  let esconderEm = null;
  let aoFechar = null;
  let listeners = false;

  function criarBotao() {
    host = document.createElement('div');
    host.setAttribute('data-nv-ui', 'lista');
    document.body.appendChild(host);
    const raiz = host.attachShadow({ mode: 'open' });

    const estilo = document.createElement('style');
    estilo.textContent = `
      .botao {
        position: fixed; z-index: 2147481000; display: none; align-items: center; gap: 5px;
        background: #10b981; color: #06281f; border: 0; border-radius: 7px;
        padding: 3px 9px; font: 700 11px/1.4 system-ui, "Segoe UI", sans-serif;
        cursor: pointer; box-shadow: 0 3px 12px rgba(0,0,0,.45); white-space: nowrap;
      }
      .botao:hover { filter: brightness(1.08); }
      .botao.ocupado { background: #7f1d1d; color: #fee2e2; cursor: progress; }
    `;
    raiz.appendChild(estilo);

    botao = document.createElement('button');
    botao.className = 'botao';
    raiz.appendChild(botao);

    botao.addEventListener('mouseenter', function () {
      if (esconderEm) {
        clearTimeout(esconderEm);
        esconderEm = null;
      }
    });
    botao.addEventListener('mouseleave', agendarEsconder);
    botao.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!itemAtual || !aoFechar) return;
      const numero = itemAtual.numero;
      esconder();
      aoFechar(numero);
    });
  }

  function esconder() {
    itemAtual = null;
    if (botao) botao.style.display = 'none';
  }

  function agendarEsconder() {
    if (esconderEm) clearTimeout(esconderEm);
    esconderEm = setTimeout(esconder, 350);
  }

  function mostrarPara(item) {
    itemAtual = item;
    const r = dom.retanguloAbsoluto(item.el);
    if (!r.width || !r.height) return esconder();
    botao.textContent = '⚡ Fechar ' + item.numero;
    botao.style.display = 'inline-flex';
    const largura = botao.getBoundingClientRect().width || 110;
    /* Encostado na borda direita da linha, sem sair da janela. */
    const x = Math.max(4, Math.min(window.innerWidth - largura - 6, r.left + r.width - largura - 6));
    botao.style.left = x + 'px';
    botao.style.top = Math.max(2, r.top + r.height / 2 - 11) + 'px';
    return undefined;
  }

  function aoMover(ev) {
    if (!NV.config.obter().fila.botaoNaLista) return esconder();
    /* 12 quadros por segundo bastam e mantêm o custo desprezível. */
    const agora = Date.now();
    if (agora - ultimoMovimento < 80) return undefined;
    ultimoMovimento = agora;

    const alvo = dom.elementoNoPonto(ev.clientX, ev.clientY);
    if (!alvo || (alvo.closest && alvo.closest('[data-nv-ui]'))) return undefined;

    const itens = NV.fila.pendentes({ cache: true });
    for (let i = 0; i < itens.length; i += 1) {
      const item = itens[i];
      if (item.el === alvo || item.el.contains(alvo)) {
        if (esconderEm) {
          clearTimeout(esconderEm);
          esconderEm = null;
        }
        if (!itemAtual || itemAtual.numero !== item.numero) mostrarPara(item);
        return undefined;
      }
    }
    if (itemAtual) agendarEsconder();
    return undefined;
  }

  lista.definirOcupado = function (valor) {
    if (!botao) return;
    botao.classList.toggle('ocupado', !!valor);
    if (valor) esconder();
  };

  lista.montado = function () {
    return !!host && host.isConnected;
  };

  /* aoFecharOs: função que recebe o número da OS e executa o fechamento. */
  lista.iniciar = function (aoFecharOs) {
    aoFechar = aoFecharOs;
    if (!lista.montado()) {
      host = null;
      criarBotao();
    }
    if (!listeners) {
      dom.ouvirTodos('mousemove', aoMover, true);
      dom.ouvirTodos('scroll', esconder, true);
      listeners = true;
    }
    return lista;
  };

  NV.lista = lista;
})((globalThis.NV = globalThis.NV || {}));
