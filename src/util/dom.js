/*
 * Camada de acesso ao DOM da aplicação.
 * O Neovero não expõe ids estáveis, então tudo aqui é baseado em texto visível,
 * atributos de acessibilidade e, quando o usuário calibra manualmente, em seletores CSS
 * gravados pelo modo "aprender".
 */
(function (NV) {
  'use strict';

  const text = NV.text;
  const dom = {};

  const CLICAVEIS = [
    'button',
    'a[href]',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    'input[type="button"]',
    'input[type="submit"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const CONTROLES = [
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[role="combobox"]',
    '[role="listbox"]',
    '[contenteditable="true"]'
  ].join(',');

  const PAINEIS_DROPDOWN = [
    '[role="listbox"]',
    '[role="menu"]',
    '.dropdown-menu',
    '.select2-results',
    '.ng-dropdown-panel',
    '.mat-select-panel',
    '.mat-mdc-select-panel',
    '.p-dropdown-panel',
    '.p-select-overlay',
    '.v-overlay',
    '.k-animation-container',
    '.MuiPopover-root',
    '.tt-menu'
  ].join(',');

  dom.CLICAVEIS = CLICAVEIS;
  dom.CONTROLES = CONTROLES;
  dom.PAINEIS_DROPDOWN = PAINEIS_DROPDOWN;

  dom.visivel = function (el) {
    if (!el || el.nodeType !== 1) return false;
    if (!el.isConnected) return false;
    const estilo = el.ownerDocument.defaultView.getComputedStyle(el);
    if (estilo.display === 'none' || estilo.visibility === 'hidden' || Number(estilo.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  dom.habilitado = function (el) {
    if (!el) return false;
    if (el.disabled) return false;
    return el.getAttribute('aria-disabled') !== 'true' && !/\bdisabled\b/.test(el.className || '');
  };

  /* Todos os elementos de um escopo, atravessando shadow roots. */
  dom.elementos = function (raiz) {
    const base = raiz || document;
    const encontrados = [];
    const visitar = function (no) {
      const lista = no.querySelectorAll('*');
      for (let i = 0; i < lista.length; i += 1) {
        const el = lista[i];
        if (el.closest && el.closest('[data-nv-ui]')) continue;
        encontrados.push(el);
        if (el.shadowRoot) visitar(el.shadowRoot);
      }
    };
    visitar(base);
    return encontrados;
  };

  /* Texto dos nós de texto diretos: isola o rótulo de wrappers com ícones e filhos. */
  dom.textoProprio = function (el) {
    if (!el) return '';
    let out = '';
    for (let i = 0; i < el.childNodes.length; i += 1) {
      const no = el.childNodes[i];
      if (no.nodeType === 3) out += no.nodeValue;
    }
    return out.replace(/\s+/g, ' ').trim();
  };

  dom.texto = function (el) {
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  };

  /* Rótulos alternativos de um elemento (útil para botões que só têm ícone). */
  dom.rotulos = function (el) {
    if (!el) return [];
    const attrs = ['aria-label', 'title', 'data-title', 'data-tooltip', 'placeholder', 'name', 'alt'];
    const lista = [dom.textoProprio(el)];
    attrs.forEach(function (attr) {
      const valor = el.getAttribute && el.getAttribute(attr);
      if (valor) lista.push(valor);
    });
    return lista.filter(Boolean);
  };

  dom.profundidade = function (el) {
    let n = 0;
    let atual = el;
    while (atual && atual.parentElement) {
      n += 1;
      atual = atual.parentElement;
    }
    return n;
  };

  dom.area = function (el) {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };

  /*
   * Procura o elemento cujo rótulo melhor corresponde a um dos alvos.
   * Prefere correspondência exata, elemento mais profundo (mais específico) e menor área.
   */
  dom.acharPorTexto = function (raiz, alvos, options) {
    const opts = options || {};
    const lista = Array.isArray(alvos) ? alvos : [alvos];
    const min = opts.min != null ? opts.min : 0.9;
    const filtro = opts.filtro;
    const candidatos = [];

    dom.elementos(raiz).forEach(function (el) {
      if (opts.exigirVisivel !== false && !dom.visivel(el)) return;
      if (filtro && !filtro(el)) return;
      let melhor = 0;
      dom.rotulos(el).forEach(function (rotulo) {
        lista.forEach(function (alvo) {
          const s = text.score(rotulo, alvo);
          if (s > melhor) melhor = s;
        });
      });
      if (melhor >= min) candidatos.push({ el: el, score: melhor });
    });

    candidatos.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      const pa = dom.profundidade(a.el);
      const pb = dom.profundidade(b.el);
      if (pb !== pa) return pb - pa;
      return dom.area(a.el) - dom.area(b.el);
    });

    return candidatos.length ? candidatos[0].el : null;
  };

  /* Sobe até o ancestral clicável mais próximo (o texto costuma ficar num span interno). */
  dom.alvoClicavel = function (el, maxNiveis) {
    if (!el) return null;
    const limite = maxNiveis || 4;
    let atual = el;
    for (let i = 0; i <= limite && atual; i += 1) {
      if (atual.matches && atual.matches(CLICAVEIS)) return atual;
      atual = atual.parentElement;
    }
    return el;
  };

  dom.acharBotao = function (raiz, alvos, options) {
    const opts = Object.assign({ min: 0.9 }, options || {});
    const achado = dom.acharPorTexto(raiz, alvos, opts);
    if (!achado) return null;
    return dom.alvoClicavel(achado, opts.niveis);
  };

  /*
   * Localiza o campo associado a um rótulo. Cobre os três casos usuais:
   * label[for], controle dentro do label e rótulo acima/ao lado do controle.
   */
  dom.acharCampoPorRotulo = function (raiz, alvos, options) {
    const opts = options || {};
    const lista = Array.isArray(alvos) ? alvos : [alvos];
    const seletorControle = opts.controle || CONTROLES;
    const rotulos = [];

    dom.elementos(raiz).forEach(function (el) {
      if (el.matches && el.matches(seletorControle)) return;
      const proprio = dom.textoProprio(el);
      if (!proprio) return;
      let melhor = 0;
      lista.forEach(function (alvo) {
        const s = text.score(proprio, alvo);
        if (s > melhor) melhor = s;
      });
      if (melhor >= (opts.min != null ? opts.min : 0.95)) rotulos.push({ el: el, score: melhor });
    });

    rotulos.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return dom.profundidade(b.el) - dom.profundidade(a.el);
    });

    for (let i = 0; i < rotulos.length; i += 1) {
      const controle = dom.controleProximo(rotulos[i].el, seletorControle, opts);
      if (controle) return controle;
    }
    return null;
  };

  dom.controleProximo = function (rotulo, seletorControle, options) {
    const opts = options || {};
    const seletor = seletorControle || CONTROLES;
    const aceita = function (el) {
      if (!el) return false;
      if (opts.exigirVisivel !== false && !dom.visivel(el)) return false;
      if (opts.ignorar && opts.ignorar(el)) return false;
      return true;
    };

    const forId = rotulo.getAttribute && rotulo.getAttribute('for');
    if (forId) {
      const doc = rotulo.ownerDocument;
      const alvo = doc.getElementById(forId);
      if (alvo && aceita(alvo)) return alvo;
    }

    const interno = rotulo.querySelector(seletor);
    if (aceita(interno)) return interno;

    let irmao = rotulo.nextElementSibling;
    while (irmao) {
      if (irmao.matches(seletor) && aceita(irmao)) return irmao;
      const dentro = irmao.querySelector(seletor);
      if (aceita(dentro)) return dentro;
      irmao = irmao.nextElementSibling;
    }

    let container = rotulo.parentElement;
    for (let nivel = 0; nivel < (opts.niveis || 3) && container; nivel += 1) {
      const candidatos = container.querySelectorAll(seletor);
      for (let i = 0; i < candidatos.length; i += 1) {
        if (aceita(candidatos[i])) return candidatos[i];
      }
      container = container.parentElement;
    }
    return null;
  };

  /* Frameworks reativos só reconhecem o valor quando ele passa pelo setter nativo. */
  dom.definirValor = function (el, valor) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, valor);
    else el.value = valor;
    dom.disparar(el, 'input');
    dom.disparar(el, 'change');
  };

  dom.disparar = function (el, tipo, extra) {
    const janela = el.ownerDocument.defaultView;
    let evento;
    if (tipo === 'input' || tipo === 'change') {
      evento = new janela.Event(tipo, { bubbles: true });
    } else if (/^key/.test(tipo)) {
      evento = new janela.KeyboardEvent(tipo, Object.assign({ bubbles: true, cancelable: true }, extra || {}));
    } else if (/^(mouse|click|dblclick|pointer)/.test(tipo)) {
      evento = new janela.MouseEvent(tipo, Object.assign({ bubbles: true, cancelable: true, view: janela }, extra || {}));
    } else {
      evento = new janela.Event(tipo, { bubbles: true });
    }
    el.dispatchEvent(evento);
  };

  /* Digitação tecla por tecla, para campos com máscara que ignoram value direto. */
  dom.digitar = async function (el, valor, options) {
    const opts = options || {};
    const atraso = opts.atraso != null ? opts.atraso : 15;
    el.focus();
    dom.definirValor(el, '');
    for (let i = 0; i < valor.length; i += 1) {
      const ch = valor[i];
      dom.disparar(el, 'keydown', { key: ch });
      dom.disparar(el, 'keypress', { key: ch });
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      const atual = el.value + ch;
      if (setter && setter.set) setter.set.call(el, atual);
      else el.value = atual;
      dom.disparar(el, 'input');
      dom.disparar(el, 'keyup', { key: ch });
      if (atraso) await NV.async.sleep(atraso);
    }
    dom.disparar(el, 'change');
  };

  dom.clicar = function (el) {
    if (!el) throw new NV.async.PassoError('Elemento inexistente para clique');
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'center' });
    dom.disparar(el, 'pointerdown');
    dom.disparar(el, 'mousedown');
    dom.disparar(el, 'mouseup');
    if (typeof el.click === 'function') el.click();
    else dom.disparar(el, 'click');
  };

  dom.dialogos = function () {
    const seletor = '[role="dialog"], dialog[open], .modal, .ui-dialog, .mat-dialog-container, .p-dialog, .v-window';
    return dom.elementos(document).filter(function (el) {
      return el.matches && el.matches(seletor) && dom.visivel(el);
    });
  };

  /* Um "diálogo" pode ser só uma div flutuante: cai para heurística de z-index. */
  dom.dialogoPorTitulo = function (titulos) {
    const lista = Array.isArray(titulos) ? titulos : [titulos];
    const dialogos = dom.dialogos();
    for (let i = dialogos.length - 1; i >= 0; i -= 1) {
      const t = text.normalize(dom.texto(dialogos[i]));
      const combina = lista.some(function (titulo) {
        return t.includes(text.normalize(titulo));
      });
      if (combina) return dialogos[i];
    }
    const alvo = dom.acharPorTexto(document, lista, { min: 0.95 });
    if (!alvo) return null;
    let atual = alvo.parentElement;
    for (let n = 0; n < 8 && atual; n += 1) {
      const estilo = atual.ownerDocument.defaultView.getComputedStyle(atual);
      const flutuante = estilo.position === 'fixed' || estilo.position === 'absolute';
      if (flutuante && atual.querySelector(CONTROLES)) return atual;
      atual = atual.parentElement;
    }
    return alvo.parentElement;
  };

  dom.snapshot = function () {
    return new Set(dom.elementos(document));
  };

  /* Elementos visíveis que apareceram depois do snapshot (paineis de dropdown). */
  dom.novosVisiveis = function (anterior) {
    return dom.elementos(document).filter(function (el) {
      return !anterior.has(el) && dom.visivel(el);
    });
  };

  dom.descrever = function (el) {
    if (!el) return 'null';
    const partes = [el.tagName.toLowerCase()];
    if (el.id) partes.push('#' + el.id);
    const classes = (el.getAttribute && el.getAttribute('class')) || '';
    if (classes) partes.push('.' + classes.trim().split(/\s+/).slice(0, 3).join('.'));
    const rotulo = text.truncate(dom.textoProprio(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '', 40);
    if (rotulo) partes.push('“' + rotulo + '”');
    return partes.join('');
  };

  /* Caminho CSS estável o suficiente para reuso entre sessões. */
  dom.caminhoCss = function (el) {
    if (!el || el.nodeType !== 1) return null;
    const partes = [];
    let atual = el;
    while (atual && atual.nodeType === 1 && partes.length < 8) {
      if (atual.id && !/\d{4,}/.test(atual.id)) {
        partes.unshift('#' + CSS.escape(atual.id));
        break;
      }
      const estaveis = ['data-testid', 'data-test', 'data-id', 'name', 'aria-label'];
      let seletor = atual.tagName.toLowerCase();
      let usouAttr = false;
      for (let i = 0; i < estaveis.length; i += 1) {
        const valor = atual.getAttribute(estaveis[i]);
        if (valor && valor.length < 60) {
          seletor += '[' + estaveis[i] + '="' + CSS.escape(valor) + '"]';
          usouAttr = true;
          break;
        }
      }
      if (!usouAttr) {
        const classes = (atual.getAttribute('class') || '')
          .trim()
          .split(/\s+/)
          .filter(function (c) {
            return c && !/\d{3,}/.test(c) && c.length < 40;
          })
          .slice(0, 2);
        if (classes.length) seletor += '.' + classes.map(function (c) { return CSS.escape(c); }).join('.');
        const pai = atual.parentElement;
        if (pai) {
          const irmaos = Array.prototype.filter.call(pai.children, function (c) {
            return c.tagName === atual.tagName;
          });
          if (irmaos.length > 1) seletor += ':nth-of-type(' + (irmaos.indexOf(atual) + 1) + ')';
        }
      }
      partes.unshift(seletor);
      atual = atual.parentElement;
    }
    return partes.join(' > ');
  };

  dom.porCaminhoCss = function (caminho, raiz) {
    if (!caminho) return null;
    try {
      const el = (raiz || document).querySelector(caminho);
      return el && dom.visivel(el) ? el : null;
    } catch (erro) {
      return null;
    }
  };

  NV.dom = dom;
})((globalThis.NV = globalThis.NV || {}));
