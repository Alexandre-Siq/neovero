(function () {
'use strict';

/* ===== src/util/text.js ===== */
/* Comparação de texto tolerante a acentos, caixa, espaços e marcadores de campo obrigatório. */
(function (NV) {
  'use strict';

  const text = {};

  text.stripAccents = function (value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  text.normalize = function (value) {
    return text
      .stripAccents(value)
      .replace(/\u00a0/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  };

  /* Rótulos vêm com asterisco de obrigatório, dois-pontos ou ícones colados. */
  text.normalizeLabel = function (value) {
    return text
      .normalize(value)
      .replace(/^[\s*:•·\-|]+/, '')
      .replace(/[\s*:•·\-|]+$/, '')
      .trim();
  };

  text.equals = function (a, b) {
    return text.normalizeLabel(a) === text.normalizeLabel(b);
  };

  text.includes = function (haystack, needle) {
    const n = text.normalize(needle);
    if (!n) return false;
    return text.normalize(haystack).includes(n);
  };

  text.tokens = function (value) {
    return text.normalize(value).split(' ').filter(Boolean);
  };

  /* 1 = igual, 0 = sem relação. Usado para escolher a melhor opção de um combo. */
  text.score = function (candidate, target) {
    const c = text.normalizeLabel(candidate);
    const t = text.normalizeLabel(target);
    if (!c || !t) return 0;
    if (c === t) return 1;
    if (c.startsWith(t) || t.startsWith(c)) return 0.9;
    if (c.includes(t)) return 0.8;
    if (t.includes(c)) return 0.7;
    const ct = text.tokens(c);
    const tt = text.tokens(t);
    if (!ct.length || !tt.length) return 0;
    const common = tt.filter((token) => ct.includes(token)).length;
    if (!common) return 0;
    return 0.6 * (common / Math.max(ct.length, tt.length));
  };

  /* Retorna { item, score } do candidato mais parecido, ou null se nada passar do mínimo. */
  text.pickBest = function (candidates, target, options) {
    const opts = options || {};
    const getText = opts.getText || ((item) => item);
    const min = typeof opts.min === 'number' ? opts.min : 0.6;
    let best = null;
    (candidates || []).forEach(function (item) {
      const score = text.score(getText(item), target);
      if (score >= min && (!best || score > best.score)) best = { item: item, score: score };
    });
    return best;
  };

  text.truncate = function (value, max) {
    const limit = max || 160;
    const str = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return str.length > limit ? str.slice(0, limit - 1) + '…' : str;
  };

  NV.text = text;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/util/dates.js ===== */
/* Datas no formato brasileiro usado pelo Neovero: "28/08/2026, 09:18". */
(function (NV) {
  'use strict';

  const dates = {};
  const pad = (n) => String(n).padStart(2, '0');

  dates.format = function (date, options) {
    const opts = options || {};
    const d = date instanceof Date ? date : new Date(date);
    const dia = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    const hora = pad(d.getHours()) + ':' + pad(d.getMinutes()) + (opts.segundos ? ':' + pad(d.getSeconds()) : '');
    const separador = opts.virgula === false ? ' ' : ', ';
    return dia + separador + hora;
  };

  /* Aceita dd/MM/yyyy com hora opcional, com ou sem vírgula, com ou sem segundos. */
  dates.parse = function (value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value || ''));
    if (!m) return null;
    const d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0),
      0
    );
    if (Number.isNaN(d.getTime())) return null;
    if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
    return d;
  };

  dates.addMinutes = function (date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
  };

  dates.truncateSeconds = function (date) {
    const d = new Date(date.getTime());
    d.setSeconds(0, 0);
    return d;
  };

  /*
   * Calcula início/fim da ocorrência a partir da regra do preset.
   *   agora        -> termina agora, começa `duracaoMin` antes
   *   inicioAgora  -> começa agora, termina `duracaoMin` depois
   *   abertura     -> começa na abertura da OS (quando conhecida), termina agora
   */
  dates.resolve = function (regra, contexto) {
    const cfg = regra || {};
    const ctx = contexto || {};
    const modo = cfg.modo || 'agora';
    const duracao = Math.max(0, Number(cfg.duracaoMin != null ? cfg.duracaoMin : 1));
    const agora = dates.truncateSeconds(ctx.agora ? new Date(ctx.agora) : new Date());
    let inicio;
    let fim;

    if (modo === 'inicioAgora') {
      inicio = agora;
      fim = dates.addMinutes(agora, duracao);
    } else if (modo === 'abertura') {
      const abertura = dates.parse(ctx.aberturaOS);
      inicio = abertura ? dates.truncateSeconds(abertura) : dates.addMinutes(agora, -duracao);
      fim = agora;
    } else {
      inicio = dates.addMinutes(agora, -duracao);
      fim = agora;
    }

    if (inicio.getTime() > fim.getTime()) inicio = fim;
    return { inicio: inicio, fim: fim };
  };

  NV.dates = dates;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/util/async.js ===== */
/* Espera ativa com timeout: a UI do Neovero renderiza de forma assíncrona. */
(function (NV) {
  'use strict';

  const async = {};

  class PassoError extends Error {
    constructor(mensagem, detalhes) {
      super(mensagem);
      this.name = 'PassoError';
      Object.assign(this, detalhes || {});
    }
  }
  async.PassoError = PassoError;

  async.sleep = function (ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
  };

  /*
   * Reavalia `fn` até devolver algo "verdadeiro" (elemento, objeto, true).
   * Rejeita com PassoError quando estoura o timeout.
   */
  async.waitFor = async function (fn, options) {
    const opts = options || {};
    const timeout = opts.timeout != null ? opts.timeout : 10000;
    const intervalo = opts.intervalo != null ? opts.intervalo : 120;
    const rotulo = opts.rotulo || 'condição';
    const limite = Date.now() + timeout;
    let ultimoErro = null;

    for (;;) {
      try {
        const resultado = await fn();
        if (resultado) return resultado;
        ultimoErro = null;
      } catch (erro) {
        ultimoErro = erro;
      }
      if (Date.now() >= limite) {
        throw new PassoError('Tempo esgotado esperando ' + rotulo + ' (' + timeout + 'ms)', {
          rotulo: rotulo,
          causa: ultimoErro ? String(ultimoErro.message || ultimoErro) : null
        });
      }
      await async.sleep(intervalo);
    }
  };

  /* Espera até que a condição deixe de ser verdadeira (ex.: modal fechar). */
  async.waitUntilGone = function (fn, options) {
    return async.waitFor(async function () {
      const valor = await fn();
      return valor ? false : true;
    }, options);
  };

  async.tentar = async function (fn, options) {
    const opts = options || {};
    const tentativas = Math.max(1, opts.tentativas || 3);
    const espera = opts.espera != null ? opts.espera : 250;
    let ultimo = null;
    for (let i = 0; i < tentativas; i += 1) {
      try {
        return await fn(i);
      } catch (erro) {
        ultimo = erro;
        if (i < tentativas - 1) await async.sleep(espera * (i + 1));
      }
    }
    throw ultimo;
  };

  NV.async = async;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/util/dom.js ===== */
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

/* ===== src/core/log.js ===== */
/* Log em memória: alimenta o painel e o arquivo de diagnóstico. */
(function (NV) {
  'use strict';

  const MAX = 500;
  const entradas = [];
  const ouvintes = new Set();

  function registrar(nivel, mensagem, dados) {
    const entrada = {
      t: new Date().toISOString(),
      nivel: nivel,
      mensagem: String(mensagem),
      dados: dados == null ? null : dados
    };
    entradas.push(entrada);
    if (entradas.length > MAX) entradas.splice(0, entradas.length - MAX);
    ouvintes.forEach(function (fn) {
      try {
        fn(entrada);
      } catch (erro) {
        /* um ouvinte quebrado não pode derrubar o fluxo */
      }
    });
    if (NV.log.console) {
      const prefixo = '[Neovero+]';
      if (nivel === 'erro') console.error(prefixo, mensagem, dados || '');
      else if (nivel === 'aviso') console.warn(prefixo, mensagem, dados || '');
      else console.log(prefixo, mensagem, dados || '');
    }
    return entrada;
  }

  NV.log = {
    console: false,
    info: (m, d) => registrar('info', m, d),
    passo: (m, d) => registrar('passo', m, d),
    aviso: (m, d) => registrar('aviso', m, d),
    erro: (m, d) => registrar('erro', m, d),
    entradas: () => entradas.slice(),
    limpar: () => entradas.splice(0, entradas.length),
    inscrever: function (fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    }
  };
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/core/config.js ===== */
/*
 * Configuração persistida. Usa o storage do gerenciador de userscripts quando existe
 * (compartilhado entre subdomínios) e cai para localStorage na extensão/navegador puro.
 */
(function (NV) {
  'use strict';

  const CHAVE = 'neovero-fechamento-rapido/config';

  const PRESETS_PADRAO = [
    {
      id: 'ti-configuracao',
      nome: 'TI — Configuração de equipamentos',
      ocorrencia: 'SUPORTE - TI',
      servico: 'CONFIGURAÇÃO DE EQUIPAMENTOS',
      causa: '',
      local: 'interno',
      observacao: '',
      datas: { modo: 'agora', duracaoMin: 1 }
    },
    {
      id: 'ti-suporte-remoto',
      nome: 'TI — Suporte remoto',
      ocorrencia: 'SUPORTE - TI',
      servico: '',
      causa: '',
      local: 'interno',
      observacao: 'Atendimento remoto realizado.',
      datas: { modo: 'agora', duracaoMin: 5 }
    }
  ];

  const PADRAO = {
    versao: 1,
    hostsLiberados: [],
    execucaoSeca: false,
    confirmarAntesDeFechar: true,
    autoIniciarAtendimento: true,
    salvarOsAntesDeFechar: false,
    fecharOsAposOcorrencia: true,
    fecharCalendarioComEsc: true,
    logNoConsole: false,
    presetAtivo: 'ti-configuracao',
    presets: PRESETS_PADRAO,
    atalhos: {
      fechar: 'Alt+F',
      lote: 'Alt+Shift+F',
      painel: 'Alt+N'
    },
    tempos: {
      elemento: 10000,
      modal: 12000,
      salvar: 20000,
      fechar: 20000,
      intervalo: 120
    },
    lote: {
      habilitado: false,
      esperaEntreOs: 1500,
      maximo: 25,
      pararNoPrimeiroErro: true
    },
    entradaDatas: 'auto',
    rotulos: {
      botaoOcorrencia: ['Ocorrência'],
      tituloModal: ['Nova Ocorrência'],
      campoOcorrencia: ['Ocorrência'],
      campoDataOcorrencia: ['Data da Ocorrência'],
      campoDataFinal: ['Data Final do Serviço'],
      campoCausa: ['Causa'],
      campoServico: ['Serviço'],
      campoObservacao: ['Observação', 'Observacao'],
      opcaoInterno: ['Interno'],
      opcaoExterno: ['Externo'],
      continuarIncluindo: ['Continuar Incluindo'],
      salvarModal: ['Salvar'],
      cancelarModal: ['Cancelar'],
      iniciarAtendimento: ['Iniciar Atendimento'],
      fecharOs: ['Fechar OS'],
      salvarOs: ['Salvar'],
      janelaOs: ['ORDEM DE SERVIÇO'],
      confirmar: ['Sim', 'Confirmar', 'OK', 'Fechar OS', 'Concluir']
    },
    seletores: {},
    painel: { x: null, y: null, recolhido: false }
  };

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  /* Mescla preservando o formato do padrão: se o usuário salvou algo com tipo errado, ignora. */
  function mesclar(padrao, salvo) {
    if (salvo === undefined || salvo === null) return clonar(padrao);
    if (Array.isArray(padrao)) return Array.isArray(salvo) ? clonar(salvo) : clonar(padrao);
    if (typeof padrao === 'object') {
      if (typeof salvo !== 'object' || Array.isArray(salvo)) return clonar(padrao);
      const saida = {};
      Object.keys(padrao).forEach(function (chave) {
        saida[chave] = mesclar(padrao[chave], salvo[chave]);
      });
      Object.keys(salvo).forEach(function (chave) {
        if (!(chave in saida)) saida[chave] = clonar(salvo[chave]);
      });
      return saida;
    }
    return typeof salvo === typeof padrao ? salvo : clonar(padrao);
  }

  function lerBruto() {
    try {
      if (typeof GM_getValue === 'function') {
        const valor = GM_getValue(CHAVE, null);
        if (valor) return typeof valor === 'string' ? JSON.parse(valor) : valor;
      }
    } catch (erro) {
      /* segue para localStorage */
    }
    try {
      const cru = localStorage.getItem(CHAVE);
      return cru ? JSON.parse(cru) : null;
    } catch (erro) {
      return null;
    }
  }

  function gravarBruto(objeto) {
    const cru = JSON.stringify(objeto);
    let gravou = false;
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(CHAVE, cru);
        gravou = true;
      }
    } catch (erro) {
      /* segue para localStorage */
    }
    try {
      localStorage.setItem(CHAVE, cru);
      gravou = true;
    } catch (erro) {
      /* pode falhar em modo privado */
    }
    return gravou;
  }

  let atual = null;

  const config = {
    CHAVE: CHAVE,
    PADRAO: PADRAO,
    clonar: clonar,
    mesclar: mesclar,

    carregar: function () {
      atual = mesclar(PADRAO, lerBruto());
      return atual;
    },

    obter: function () {
      if (!atual) config.carregar();
      return atual;
    },

    salvar: function (novo) {
      atual = mesclar(PADRAO, novo || atual);
      const ok = gravarBruto(atual);
      if (!ok && NV.log) NV.log.aviso('Não foi possível persistir a configuração neste navegador');
      return atual;
    },

    aplicar: function (mudancas) {
      return config.salvar(mesclar(config.obter(), mudancas || {}));
    },

    restaurarPadrao: function () {
      return config.salvar(clonar(PADRAO));
    },

    presetAtivo: function () {
      const cfg = config.obter();
      const achado = cfg.presets.find(function (p) {
        return p.id === cfg.presetAtivo;
      });
      return achado || cfg.presets[0] || null;
    },

    definirPresetAtivo: function (id) {
      return config.aplicar({ presetAtivo: id });
    },

    salvarPreset: function (preset) {
      const cfg = config.obter();
      const presets = cfg.presets.slice();
      const idx = presets.findIndex(function (p) {
        return p.id === preset.id;
      });
      if (idx >= 0) presets[idx] = preset;
      else presets.push(preset);
      return config.salvar(Object.assign({}, cfg, { presets: presets }));
    },

    removerPreset: function (id) {
      const cfg = config.obter();
      const presets = cfg.presets.filter(function (p) {
        return p.id !== id;
      });
      const presetAtivo = cfg.presetAtivo === id ? (presets[0] && presets[0].id) || '' : cfg.presetAtivo;
      return config.salvar(Object.assign({}, cfg, { presets: presets, presetAtivo: presetAtivo }));
    },

    /* Validação usada pela tela de configuração antes de gravar. */
    validarPreset: function (preset) {
      const erros = [];
      if (!preset || !String(preset.nome || '').trim()) erros.push('Informe um nome para o preset.');
      if (!preset || !String(preset.ocorrencia || '').trim()) erros.push('O campo "Ocorrência" é obrigatório.');
      if (!preset || !String(preset.servico || '').trim()) erros.push('O campo "Serviço" é obrigatório.');
      const modo = preset && preset.datas && preset.datas.modo;
      if (modo && ['agora', 'inicioAgora', 'abertura'].indexOf(modo) < 0) erros.push('Modo de data inválido: ' + modo);
      const duracao = preset && preset.datas ? Number(preset.datas.duracaoMin) : 0;
      if (Number.isNaN(duracao) || duracao < 0 || duracao > 24 * 60) erros.push('Duração deve estar entre 0 e 1440 minutos.');
      return erros;
    },

    gerarId: function (nome) {
      const base = NV.text
        .normalize(nome || 'preset')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return (base || 'preset') + '-' + Math.random().toString(36).slice(2, 6);
    },

    seletor: function (chave) {
      const cfg = config.obter();
      return cfg.seletores ? cfg.seletores[chave] || null : null;
    },

    definirSeletor: function (chave, caminho) {
      const cfg = config.obter();
      const seletores = Object.assign({}, cfg.seletores);
      if (caminho) seletores[chave] = caminho;
      else delete seletores[chave];
      return config.salvar(Object.assign({}, cfg, { seletores: seletores }));
    }
  };

  NV.config = config;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/core/localizar.js ===== */
/*
 * Tradução de "elemento lógico" -> "elemento do DOM".
 * Ordem de resolução: seletor CSS calibrado pelo usuário (modo aprender) -> heurística por texto.
 * Assim o script funciona sem conhecer o HTML do Neovero e fica preciso depois da calibração.
 */
(function (NV) {
  'use strict';

  const dom = NV.dom;
  const text = NV.text;

  const localizar = {};

  function rotulos(chave) {
    const cfg = NV.config.obter();
    return (cfg.rotulos && cfg.rotulos[chave]) || [];
  }

  /* Tenta o seletor gravado; se falhar, usa a heurística. */
  function resolver(chave, heuristica) {
    const caminho = NV.config.seletor(chave);
    if (caminho) {
      const el = dom.porCaminhoCss(caminho);
      if (el) return el;
      NV.log.aviso('Seletor calibrado não encontrado, voltando à heurística', { chave: chave, seletor: caminho });
    }
    return heuristica() || null;
  }

  localizar.CHAVES = [
    'botaoOcorrencia',
    'campoOcorrencia',
    'campoDataOcorrencia',
    'campoDataFinal',
    'campoCausa',
    'campoServico',
    'campoObservacao',
    'botaoSalvarModal',
    'botaoFecharOs',
    'botaoIniciarAtendimento'
  ];

  /* Janela (aba MDI) da Ordem de Serviço em foco. */
  localizar.janelaOs = function () {
    const titulos = rotulos('janelaOs');
    const tituloEl = dom.acharPorTexto(document, titulos, { min: 0.6 });
    if (!tituloEl) return document.body;
    let atual = tituloEl;
    let melhor = tituloEl;
    for (let n = 0; n < 12 && atual; n += 1) {
      const t = text.normalize(dom.texto(atual));
      if (t.includes('requisicao de servico') || t.includes('ocorrencia')) {
        melhor = atual;
        break;
      }
      melhor = atual;
      atual = atual.parentElement;
    }
    return melhor || document.body;
  };

  localizar.numeroOs = function (janela) {
    const escopo = janela || localizar.janelaOs();
    const titulos = rotulos('janelaOs');
    const tituloEl = dom.acharPorTexto(escopo, titulos, { min: 0.6 }) || escopo;
    const m = /(\d{6,})/.exec(dom.texto(tituloEl));
    return m ? m[1] : null;
  };

  /*
   * Data de abertura exibida como texto simples perto do rótulo "Abertura".
   * Tenta primeiro o container do rótulo (layout em células) e depois a ordem
   * do documento (layout com linha de rótulos e linha de valores).
   */
  localizar.dataAbertura = function (janela) {
    const escopo = janela || localizar.janelaOs();
    const elementos = dom.elementos(escopo);
    const indices = [];
    elementos.forEach(function (el, i) {
      if (text.equals(dom.textoProprio(el), 'Abertura')) indices.push(i);
    });
    if (!indices.length) return null;

    for (let k = 0; k < indices.length; k += 1) {
      const rotulo = elementos[indices[k]];
      let container = rotulo.parentElement;
      for (let nivel = 0; nivel < 2 && container; nivel += 1) {
        const candidatos = container.querySelectorAll('*');
        for (let i = 0; i < candidatos.length; i += 1) {
          if (candidatos[i] === rotulo) continue;
          const data = NV.dates.parse(dom.textoProprio(candidatos[i]));
          if (data) return data;
        }
        container = container.parentElement;
      }
    }

    const inicio = indices[0];
    for (let i = inicio + 1; i < Math.min(elementos.length, inicio + 40); i += 1) {
      const data = NV.dates.parse(dom.textoProprio(elementos[i]));
      if (data) return data;
    }
    return null;
  };

  localizar.botaoOcorrencia = function (janela) {
    const escopo = janela || localizar.janelaOs();
    return resolver('botaoOcorrencia', function () {
      return dom.acharBotao(escopo, rotulos('botaoOcorrencia'), { min: 0.95 });
    });
  };

  localizar.modalOcorrencia = function () {
    const caminho = NV.config.seletor('modalOcorrencia');
    if (caminho) {
      const el = dom.porCaminhoCss(caminho);
      if (el) return el;
    }
    return dom.dialogoPorTitulo(rotulos('tituloModal'));
  };

  function campoNoModal(chave, rotuloChave, modal, options) {
    const escopo = modal || localizar.modalOcorrencia() || document;
    return resolver(chave, function () {
      return dom.acharCampoPorRotulo(escopo, rotulos(rotuloChave), options || {});
    });
  }

  localizar.campoOcorrencia = function (modal) {
    return campoNoModal('campoOcorrencia', 'campoOcorrencia', modal);
  };

  localizar.campoServico = function (modal) {
    return campoNoModal('campoServico', 'campoServico', modal);
  };

  localizar.campoCausa = function (modal) {
    return campoNoModal('campoCausa', 'campoCausa', modal);
  };

  localizar.campoDataOcorrencia = function (modal) {
    return campoNoModal('campoDataOcorrencia', 'campoDataOcorrencia', modal, {
      controle: 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
    });
  };

  localizar.campoDataFinal = function (modal) {
    return campoNoModal('campoDataFinal', 'campoDataFinal', modal, {
      controle: 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
    });
  };

  localizar.campoObservacao = function (modal) {
    return campoNoModal('campoObservacao', 'campoObservacao', modal, {
      controle: 'textarea, input[type="text"], [contenteditable="true"]'
    });
  };

  localizar.opcaoLocal = function (modal, tipo) {
    const escopo = modal || localizar.modalOcorrencia() || document;
    const alvos = rotulos(tipo === 'externo' ? 'opcaoExterno' : 'opcaoInterno');
    const rotulo = dom.acharPorTexto(escopo, alvos, { min: 0.98 });
    if (!rotulo) return null;
    const radio = dom.controleProximo(rotulo, 'input[type="radio"], [role="radio"]', { niveis: 2 });
    return radio || dom.alvoClicavel(rotulo, 2);
  };

  localizar.botaoSalvarModal = function (modal) {
    const escopo = modal || localizar.modalOcorrencia();
    if (!escopo) return null;
    return resolver('botaoSalvarModal', function () {
      return dom.acharBotao(escopo, rotulos('salvarModal'), { min: 0.98 });
    });
  };

  localizar.botaoIniciarAtendimento = function (janela) {
    const escopo = janela || localizar.janelaOs();
    return resolver('botaoIniciarAtendimento', function () {
      return dom.acharBotao(escopo, rotulos('iniciarAtendimento'), { min: 0.95 });
    });
  };

  localizar.botaoSalvarOs = function (janela) {
    const escopo = janela || localizar.janelaOs();
    return resolver('botaoSalvarOs', function () {
      return dom.acharBotao(escopo, rotulos('salvarOs'), { min: 0.98 });
    });
  };

  /*
   * "Fechar OS" aparece como tooltip de um botão de ícone: procura em aria-label/title
   * antes de considerar texto flutuante, que poderia ser o próprio tooltip.
   */
  localizar.botaoFecharOs = function (janela) {
    const escopo = janela || localizar.janelaOs();
    return resolver('botaoFecharOs', function () {
      const alvos = rotulos('fecharOs');
      const porAtributo = dom.acharPorTexto(escopo, alvos, {
        min: 0.95,
        filtro: function (el) {
          const attrs = ['aria-label', 'title', 'data-title', 'data-tooltip'];
          return attrs.some(function (attr) {
            const valor = el.getAttribute && el.getAttribute(attr);
            return valor && text.score(valor, alvos[0]) >= 0.9;
          });
        }
      });
      if (porAtributo) return dom.alvoClicavel(porAtributo, 3);
      const porTexto = dom.acharBotao(escopo, alvos, { min: 0.98 });
      return porTexto;
    });
  };

  /* Botão de confirmação de um diálogo que apareceu depois de uma ação. */
  localizar.botaoConfirmar = function () {
    const dialogos = dom.dialogos();
    const alvos = rotulos('confirmar');
    for (let i = dialogos.length - 1; i >= 0; i -= 1) {
      const botao = dom.acharBotao(dialogos[i], alvos, { min: 0.98 });
      if (botao && dom.habilitado(botao)) return { dialogo: dialogos[i], botao: botao };
    }
    return null;
  };

  /* Itens da lista do Monitor de Atendimento (usado no modo lote). */
  localizar.itensDoMonitor = function () {
    const candidatos = [];
    dom.elementos(document).forEach(function (el) {
      const proprio = dom.textoProprio(el);
      if (!/^\d{9,}$/.test(proprio.replace(/\s/g, ''))) return;
      if (!dom.visivel(el)) return;
      const linha = dom.alvoClicavel(el, 3) || el.parentElement;
      candidatos.push({ numero: proprio.replace(/\s/g, ''), el: linha || el });
    });
    const vistos = new Set();
    return candidatos.filter(function (item) {
      if (vistos.has(item.numero)) return false;
      vistos.add(item.numero);
      return true;
    });
  };

  NV.localizar = localizar;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/core/campos.js ===== */
/*
 * Preenchimento de campos com verificação.
 * Cada função confirma o valor depois de escrever: se o framework do Neovero ignorar
 * o evento, o fluxo falha alto em vez de salvar uma ocorrência incompleta.
 */
(function (NV) {
  'use strict';

  const dom = NV.dom;
  const text = NV.text;
  const async = NV.async;

  const campos = {};

  campos.valorExibido = function (el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const opcao = el.options[el.selectedIndex];
      return opcao ? opcao.textContent.trim() : '';
    }
    if ('value' in el && typeof el.value === 'string' && el.value) return el.value.trim();
    const proprio = dom.textoProprio(el);
    if (proprio) return proprio;
    return dom.texto(el);
  };

  /* Texto visível do combo, olhando também o container (widgets mostram o valor num span irmão). */
  campos.valorDoCombo = function (el) {
    const direto = campos.valorExibido(el);
    if (direto) return direto;
    let atual = el.parentElement;
    for (let n = 0; n < 3 && atual; n += 1) {
      const t = dom.texto(atual);
      if (t) return t;
      atual = atual.parentElement;
    }
    return '';
  };

  campos.jaTem = function (el, valor, min) {
    if (!valor) return true;
    const limite = min != null ? min : 0.9;
    return text.score(campos.valorDoCombo(el), valor) >= limite;
  };

  function opcoesDe(painel) {
    const seletor = '[role="option"], li, tr, td, a, div, span, option';
    const brutos = Array.prototype.slice.call(painel.querySelectorAll(seletor));
    const itens = [];
    brutos.forEach(function (el) {
      if (!dom.visivel(el) && el.tagName !== 'OPTION') return;
      const proprio = el.tagName === 'OPTION' ? el.textContent.trim() : dom.textoProprio(el);
      if (!proprio) return;
      itens.push({ el: el, texto: proprio });
    });
    /* Mantém o elemento mais profundo para cada texto: evita clicar num wrapper. */
    const porTexto = new Map();
    itens.forEach(function (item) {
      const chave = text.normalize(item.texto);
      const anterior = porTexto.get(chave);
      if (!anterior || dom.profundidade(item.el) > dom.profundidade(anterior.el)) porTexto.set(chave, item);
    });
    return Array.from(porTexto.values());
  }
  campos.opcoesDe = opcoesDe;

  function painelAberto(antes, comboEl) {
    const conhecidos = dom.elementos(document).filter(function (el) {
      return el.matches && el.matches(dom.PAINEIS_DROPDOWN) && dom.visivel(el) && opcoesDe(el).length;
    });
    if (conhecidos.length) return conhecidos[conhecidos.length - 1];

    const novos = dom.novosVisiveis(antes).filter(function (el) {
      if (comboEl && (el.contains(comboEl) || el === comboEl)) return false;
      return opcoesDe(el).length >= 2;
    });
    if (!novos.length) return null;
    /* O painel é o ancestral comum mais raso entre os novos elementos com opções. */
    novos.sort(function (a, b) {
      const d = dom.profundidade(a) - dom.profundidade(b);
      if (d !== 0) return d;
      return opcoesDe(b).length - opcoesDe(a).length;
    });
    return novos[0];
  }

  /*
   * Fecha calendário/lista flutuante com Escape. Em alguns temas o Escape também
   * fecha o modal inteiro, por isso o comportamento nos campos de data é desligável.
   */
  campos.fecharPainel = function (el, options) {
    const opts = options || {};
    if (opts.motivo === 'data' && NV.config.obter().fecharCalendarioComEsc === false) return;
    try {
      const alvo = el || document.activeElement || document.body;
      dom.disparar(alvo, 'keydown', { key: 'Escape', keyCode: 27 });
      dom.disparar(alvo, 'keyup', { key: 'Escape', keyCode: 27 });
    } catch (erro) {
      /* ignora */
    }
  };

  /*
   * Seleciona um valor em combo nativo (<select>) ou em widget customizado
   * (clique no gatilho -> painel flutuante -> clique na opção).
   */
  campos.definirCombo = async function (el, valor, options) {
    const opts = options || {};
    const rotulo = opts.rotulo || 'combo';
    if (!el) throw new async.PassoError('Campo não encontrado: ' + rotulo, { rotulo: rotulo });
    if (!valor) return { alterado: false, motivo: 'valor vazio' };
    if (campos.jaTem(el, valor)) return { alterado: false, motivo: 'já preenchido' };

    if (el.tagName === 'SELECT') {
      const opcoes = Array.prototype.slice.call(el.options);
      const melhor = text.pickBest(opcoes, valor, {
        getText: (o) => o.textContent,
        min: 0.7
      });
      if (!melhor) {
        throw new async.PassoError('Opção não encontrada em ' + rotulo + ': “' + valor + '”', {
          rotulo: rotulo,
          disponiveis: opcoes.map((o) => o.textContent.trim()).slice(0, 40)
        });
      }
      el.focus();
      dom.definirValor(el, melhor.item.value);
      return { alterado: true, texto: melhor.item.textContent.trim(), score: melhor.score };
    }

    const tempos = NV.config.obter().tempos;
    const antes = dom.snapshot();
    const gatilho = dom.alvoClicavel(el, 2) || el;
    dom.clicar(gatilho);

    let painel = null;
    try {
      painel = await async.waitFor(() => painelAberto(antes, el), {
        timeout: tempos.elemento,
        intervalo: tempos.intervalo,
        rotulo: 'lista de opções de ' + rotulo
      });
    } catch (erro) {
      /* Alguns combos só abrem a lista depois de digitar. */
      if (el.tagName === 'INPUT') {
        await dom.digitar(el, String(valor).slice(0, 12));
        painel = await async.waitFor(() => painelAberto(antes, el), {
          timeout: tempos.elemento,
          intervalo: tempos.intervalo,
          rotulo: 'lista de opções de ' + rotulo + ' (após digitar)'
        });
      } else {
        throw erro;
      }
    }

    let melhor = text.pickBest(opcoesDe(painel), valor, { getText: (o) => o.texto, min: 0.8 });

    if (!melhor && el.tagName === 'INPUT') {
      await dom.digitar(el, String(valor).slice(0, 12));
      await async.sleep(250);
      const painel2 = painelAberto(antes, el) || painel;
      melhor = text.pickBest(opcoesDe(painel2), valor, { getText: (o) => o.texto, min: 0.8 });
      if (melhor) painel = painel2;
    }

    if (!melhor) {
      const disponiveis = opcoesDe(painel).map((o) => o.texto).slice(0, 40);
      campos.fecharPainel(el);
      throw new async.PassoError('Opção não encontrada em ' + rotulo + ': “' + valor + '”', {
        rotulo: rotulo,
        disponiveis: disponiveis
      });
    }

    dom.clicar(melhor.item.el);

    await async.waitFor(() => campos.jaTem(el, valor, 0.75), {
      timeout: tempos.elemento,
      intervalo: tempos.intervalo,
      rotulo: 'confirmação do valor de ' + rotulo
    });

    return { alterado: true, texto: melhor.item.texto, score: melhor.score };
  };

  /* Escreve data/hora; em campos com máscara cai para digitação tecla por tecla. */
  campos.definirData = async function (el, data, options) {
    const opts = options || {};
    const rotulo = opts.rotulo || 'data';
    if (!el) throw new async.PassoError('Campo de data não encontrado: ' + rotulo, { rotulo: rotulo });
    const cfg = NV.config.obter();
    const valor = NV.dates.format(data, { virgula: opts.virgula });
    const confere = function () {
      const atual = NV.dates.parse(campos.valorExibido(el));
      if (!atual) return false;
      return Math.abs(atual.getTime() - NV.dates.truncateSeconds(data).getTime()) <= 60000;
    };

    const modo = cfg.entradaDatas || 'auto';

    if (modo !== 'teclas') {
      el.focus();
      dom.definirValor(el, valor);
      dom.disparar(el, 'blur');
      campos.fecharPainel(el, { motivo: 'data' });
      await async.sleep(120);
      if (confere()) return { valor: valor, via: 'valor' };
      if (modo === 'valor') {
        throw new async.PassoError('Não foi possível escrever a ' + rotulo, { rotulo: rotulo, tentado: valor, lido: campos.valorExibido(el) });
      }
    }

    await dom.digitar(el, valor);
    dom.disparar(el, 'blur');
    campos.fecharPainel(el, { motivo: 'data' });
    await async.sleep(120);
    if (confere()) return { valor: valor, via: 'teclas' };

    throw new async.PassoError('Não foi possível escrever a ' + rotulo, {
      rotulo: rotulo,
      tentado: valor,
      lido: campos.valorExibido(el)
    });
  };

  campos.definirTexto = function (el, valor, options) {
    const opts = options || {};
    if (!el) {
      if (opts.obrigatorio) throw new async.PassoError('Campo de texto não encontrado: ' + (opts.rotulo || ''));
      return { alterado: false };
    }
    if (!valor) return { alterado: false };
    el.focus();
    if (el.isContentEditable) {
      el.textContent = valor;
      dom.disparar(el, 'input');
    } else {
      dom.definirValor(el, valor);
    }
    dom.disparar(el, 'blur');
    return { alterado: true };
  };

  campos.marcarOpcao = async function (el, options) {
    const opts = options || {};
    if (!el) {
      if (opts.obrigatorio) throw new async.PassoError('Opção não encontrada: ' + (opts.rotulo || ''));
      return { alterado: false };
    }
    if (el.type === 'radio' || el.type === 'checkbox') {
      if (el.checked === (opts.marcado !== false)) return { alterado: false, motivo: 'já marcado' };
      dom.clicar(el);
      dom.disparar(el, 'change');
      await async.sleep(80);
      return { alterado: true, confirmado: el.checked };
    }
    dom.clicar(el);
    await async.sleep(80);
    return { alterado: true, confirmado: null };
  };

  NV.campos = campos;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/core/fluxo.js ===== */
/*
 * Fluxo de fechamento: abre "Nova Ocorrência", preenche, salva e fecha a OS.
 * Cada passo é verificado antes do próximo; qualquer divergência aborta com log.
 */
(function (NV) {
  'use strict';

  const dom = NV.dom;
  const text = NV.text;
  const async = NV.async;
  const localizar = NV.localizar;
  const campos = NV.campos;

  const fluxo = {};

  class Cancelado extends Error {
    constructor() {
      super('Operação cancelada');
      this.name = 'Cancelado';
    }
  }
  fluxo.Cancelado = Cancelado;

  fluxo.criarSinal = function () {
    return { cancelado: false, cancelar: function () { this.cancelado = true; } };
  };

  function checarSinal(sinal) {
    if (sinal && sinal.cancelado) throw new Cancelado();
  }

  /* Mensagens de validação/erro que a aplicação joga em modais ou toasts. */
  fluxo.mensagemDeErroNaTela = function () {
    const padrao = /(erro|falha|obrigat|inv[aá]lid|n[aã]o foi poss[ií]vel|preencha)/i;
    const seletor = '[role="alert"], .toast, .alert, .ui-messages, .p-toast, .snackbar, .mat-snack-bar-container, .notification';
    const candidatos = dom.elementos(document).filter(function (el) {
      return el.matches && el.matches(seletor) && dom.visivel(el);
    });
    for (let i = candidatos.length - 1; i >= 0; i -= 1) {
      const t = dom.texto(candidatos[i]);
      if (t && padrao.test(t)) return text.truncate(t, 240);
    }
    const dialogos = dom.dialogos();
    for (let i = dialogos.length - 1; i >= 0; i -= 1) {
      const t = dom.texto(dialogos[i]);
      if (t && padrao.test(t) && t.length < 400) return text.truncate(t, 240);
    }
    return null;
  };

  function criarExecutor(estado) {
    return async function passo(nome, fn, opcoes) {
      const opts = opcoes || {};
      checarSinal(estado.sinal);
      const inicio = Date.now();
      if (estado.aoProgresso) estado.aoProgresso({ tipo: 'inicio', passo: nome });
      try {
        const resultado = await fn();
        const registro = { passo: nome, ok: true, ms: Date.now() - inicio, resultado: resultado || null };
        estado.passos.push(registro);
        NV.log.passo(nome, registro.resultado);
        if (estado.aoProgresso) estado.aoProgresso({ tipo: 'ok', passo: nome, resultado: registro.resultado });
        return resultado;
      } catch (erro) {
        if (erro instanceof Cancelado) throw erro;
        if (opts.opcional) {
          const registro = { passo: nome, ok: true, pulado: true, ms: Date.now() - inicio, motivo: String(erro.message || erro) };
          estado.passos.push(registro);
          NV.log.aviso('Passo opcional ignorado: ' + nome, { motivo: registro.motivo });
          if (estado.aoProgresso) estado.aoProgresso({ tipo: 'pulado', passo: nome, motivo: registro.motivo });
          return null;
        }
        const mensagemApp = fluxo.mensagemDeErroNaTela();
        const registro = {
          passo: nome,
          ok: false,
          ms: Date.now() - inicio,
          erro: String(erro.message || erro),
          detalhes: erro.disponiveis ? { disponiveis: erro.disponiveis } : null,
          mensagemDaAplicacao: mensagemApp
        };
        estado.passos.push(registro);
        NV.log.erro('Falhou: ' + nome, registro);
        if (estado.aoProgresso) estado.aoProgresso({ tipo: 'erro', passo: nome, erro: registro.erro });
        throw Object.assign(erro, { passo: nome, mensagemDaAplicacao: mensagemApp });
      }
    };
  }

  fluxo.abrirModalOcorrencia = async function (janela, tempos) {
    const botao = localizar.botaoOcorrencia(janela);
    if (!botao) throw new async.PassoError('Botão "Ocorrência" não encontrado na OS');
    dom.clicar(botao);
    return async.waitFor(function () {
      const modal = localizar.modalOcorrencia();
      if (!modal) return null;
      return localizar.campoOcorrencia(modal) ? modal : null;
    }, { timeout: tempos.modal, intervalo: tempos.intervalo, rotulo: 'modal "Nova Ocorrência"' });
  };

  fluxo.preencherModal = async function (modal, preset, contexto, passo) {
    const datas = NV.dates.resolve(preset.datas, { agora: contexto.agora, aberturaOS: contexto.aberturaOS });

    await passo('Selecionar ocorrência: ' + preset.ocorrencia, function () {
      return campos.definirCombo(localizar.campoOcorrencia(modal), preset.ocorrencia, { rotulo: 'Ocorrência' });
    });

    await passo('Data da ocorrência: ' + NV.dates.format(datas.inicio), function () {
      return campos.definirData(localizar.campoDataOcorrencia(modal), datas.inicio, { rotulo: 'Data da Ocorrência' });
    });

    await passo('Data final do serviço: ' + NV.dates.format(datas.fim), function () {
      return campos.definirData(localizar.campoDataFinal(modal), datas.fim, { rotulo: 'Data Final do Serviço' });
    });

    if (preset.local) {
      await passo('Marcar ' + preset.local, function () {
        return campos.marcarOpcao(localizar.opcaoLocal(modal, preset.local), { rotulo: preset.local });
      }, { opcional: true });
    }

    if (preset.causa) {
      await passo('Selecionar causa: ' + preset.causa, function () {
        return campos.definirCombo(localizar.campoCausa(modal), preset.causa, { rotulo: 'Causa' });
      }, { opcional: true });
    }

    await passo('Selecionar serviço: ' + preset.servico, function () {
      return campos.definirCombo(localizar.campoServico(modal), preset.servico, { rotulo: 'Serviço' });
    });

    if (preset.observacao) {
      await passo('Preencher observação', function () {
        return campos.definirTexto(localizar.campoObservacao(modal), preset.observacao, { rotulo: 'Observação' });
      }, { opcional: true });
    }

    await passo('Desmarcar "Continuar Incluindo"', async function () {
      const cfg = NV.config.obter();
      const rotulo = dom.acharPorTexto(modal, cfg.rotulos.continuarIncluindo, { min: 0.98 });
      if (!rotulo) return { alterado: false };
      const check = dom.controleProximo(rotulo, 'input[type="checkbox"]', { niveis: 2 });
      if (!check || !check.checked) return { alterado: false };
      return campos.marcarOpcao(check, { marcado: false });
    }, { opcional: true });

    return datas;
  };

  fluxo.salvarModal = async function (modal, preset, tempos) {
    const botao = localizar.botaoSalvarModal(modal);
    if (!botao) throw new async.PassoError('Botão "Salvar" do modal não encontrado');
    dom.clicar(botao);
    await async.waitUntilGone(function () {
      const atual = localizar.modalOcorrencia();
      return atual && dom.visivel(atual) ? atual : null;
    }, { timeout: tempos.salvar, intervalo: tempos.intervalo, rotulo: 'fechamento do modal após salvar' });
    return { salvo: true };
  };

  fluxo.confirmarDialogo = async function (tempos, timeoutOpcional) {
    const achado = await async.waitFor(function () {
      return localizar.botaoConfirmar();
    }, { timeout: timeoutOpcional || 1500, intervalo: 100, rotulo: 'diálogo de confirmação' });
    dom.clicar(achado.botao);
    return { confirmado: dom.descrever(achado.botao) };
  };

  /*
   * Fluxo principal.
   * options: { preset, execucaoSeca, apenasOcorrencia, aoProgresso, sinal, aoConfirmar }
   */
  fluxo.fecharOS = async function (options) {
    const opts = options || {};
    const cfg = NV.config.obter();
    const preset = opts.preset || NV.config.presetAtivo();
    const tempos = cfg.tempos;
    const execucaoSeca = opts.execucaoSeca != null ? opts.execucaoSeca : cfg.execucaoSeca;
    const estado = {
      passos: [],
      aoProgresso: opts.aoProgresso,
      sinal: opts.sinal || fluxo.criarSinal()
    };
    const passo = criarExecutor(estado);
    const inicio = Date.now();

    if (!preset) {
      return { ok: false, erro: 'Nenhum preset configurado', passos: [] };
    }
    const errosPreset = NV.config.validarPreset(preset);
    if (errosPreset.length) {
      return { ok: false, erro: errosPreset.join(' '), passos: [] };
    }

    try {
      const janela = await passo('Localizar janela da OS', function () {
        const el = localizar.janelaOs();
        if (!el || el === document.body) throw new async.PassoError('Janela da Ordem de Serviço não encontrada. Abra a OS antes.');
        return el;
      });

      const numero = localizar.numeroOs(janela);
      const aberturaOS = localizar.dataAbertura(janela);
      NV.log.info('OS em foco', { numero: numero, abertura: aberturaOS ? NV.dates.format(aberturaOS) : null });

      if (cfg.autoIniciarAtendimento) {
        await passo('Iniciar atendimento (se pendente)', async function () {
          const botao = localizar.botaoIniciarAtendimento(janela);
          if (!botao || !dom.visivel(botao)) return { necessario: false };
          dom.clicar(botao);
          await async.sleep(400);
          return { necessario: true, clicado: dom.descrever(botao) };
        }, { opcional: true });
      }

      const modal = await passo('Abrir modal "Nova Ocorrência"', function () {
        return fluxo.abrirModalOcorrencia(janela, tempos);
      });

      const datas = await fluxo.preencherModal(modal, preset, { agora: opts.agora, aberturaOS: aberturaOS }, passo);

      if (execucaoSeca) {
        NV.log.info('Execução seca: modal preenchido e mantido aberto para conferência');
        return {
          ok: true,
          execucaoSeca: true,
          numeroOs: numero,
          datas: datas,
          passos: estado.passos,
          ms: Date.now() - inicio
        };
      }

      await passo('Salvar ocorrência', function () {
        return fluxo.salvarModal(modal, preset, tempos);
      });

      await passo('Confirmar diálogo pós-salvamento', function () {
        return fluxo.confirmarDialogo(tempos, 700);
      }, { opcional: true });

      await passo('Conferir ocorrência lançada', function () {
        return async.waitFor(function () {
          const atual = localizar.janelaOs();
          return text.includes(dom.texto(atual), preset.ocorrencia) ? true : null;
        }, { timeout: tempos.salvar, intervalo: tempos.intervalo, rotulo: 'ocorrência na lista da OS' });
      }, { opcional: true });

      if (opts.apenasOcorrencia || !cfg.fecharOsAposOcorrencia) {
        return { ok: true, numeroOs: numero, datas: datas, passos: estado.passos, ms: Date.now() - inicio, fechada: false };
      }

      if (cfg.salvarOsAntesDeFechar) {
        await passo('Salvar OS', async function () {
          const botao = localizar.botaoSalvarOs(janela);
          if (!botao) return { encontrado: false };
          dom.clicar(botao);
          await async.sleep(600);
          return { encontrado: true };
        }, { opcional: true });
      }

      if (opts.aoConfirmar && cfg.confirmarAntesDeFechar) {
        const aprovado = await opts.aoConfirmar({ numeroOs: numero, preset: preset, datas: datas });
        if (!aprovado) {
          NV.log.info('Fechamento da OS cancelado pelo usuário (ocorrência já foi lançada)');
          return { ok: true, numeroOs: numero, datas: datas, passos: estado.passos, ms: Date.now() - inicio, fechada: false };
        }
      }

      await passo('Clicar em "Fechar OS"', async function () {
        const janelaAtual = localizar.janelaOs();
        const botao = localizar.botaoFecharOs(janelaAtual);
        if (!botao) {
          throw new async.PassoError(
            'Botão "Fechar OS" não encontrado. Use "Aprender botão" na configuração para apontá-lo manualmente.'
          );
        }
        dom.clicar(botao);
        await async.sleep(300);
        return { clicado: dom.descrever(botao) };
      });

      await passo('Confirmar fechamento', function () {
        return fluxo.confirmarDialogo(tempos, 2500);
      }, { opcional: true });

      const encerrada = await passo('Conferir encerramento', function () {
        return async.waitFor(function () {
          const janelaAtual = localizar.janelaOs();
          if (!janelaAtual || janelaAtual === document.body) return { indicio: 'janela fechada' };
          const t = text.normalize(dom.texto(janelaAtual));
          if (/(encerrad|fechad|conclu[ií]d)/.test(t)) return { indicio: 'status na tela' };
          if (numero && !t.includes(numero)) return { indicio: 'outra OS em foco' };
          return null;
        }, { timeout: tempos.fechar, intervalo: tempos.intervalo, rotulo: 'confirmação de encerramento' });
      }, { opcional: true });

      return {
        ok: true,
        numeroOs: numero,
        datas: datas,
        fechada: true,
        encerramentoConfirmado: !!encerrada,
        passos: estado.passos,
        ms: Date.now() - inicio
      };
    } catch (erro) {
      const cancelado = erro instanceof Cancelado;
      return {
        ok: false,
        cancelado: cancelado,
        erro: cancelado ? 'Cancelado' : String(erro.message || erro),
        passo: erro.passo || null,
        mensagemDaAplicacao: erro.mensagemDaAplicacao || null,
        passos: estado.passos,
        ms: Date.now() - inicio
      };
    }
  };

  NV.fluxo = fluxo;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/core/lote.js ===== */
/*
 * Modo lote: percorre as OS escolhidas no Monitor de Atendimento, abre cada uma
 * e roda o fluxo de fechamento. Para no primeiro erro por padrão, para não
 * deixar meia dúzia de ocorrências pela metade.
 */
(function (NV) {
  'use strict';

  const dom = NV.dom;
  const text = NV.text;
  const async = NV.async;
  const localizar = NV.localizar;

  const lote = {};

  lote.listar = function () {
    return localizar.itensDoMonitor();
  };

  lote.abrirOs = async function (numero, tempos) {
    const item = lote.listar().find(function (i) {
      return i.numero === numero;
    });
    if (!item) throw new async.PassoError('OS ' + numero + ' não está mais na lista');
    dom.clicar(item.el);
    return async.waitFor(function () {
      const janela = localizar.janelaOs();
      if (!janela || janela === document.body) return null;
      return text.includes(dom.texto(janela), numero) ? janela : null;
    }, { timeout: tempos.modal, intervalo: tempos.intervalo, rotulo: 'abertura da OS ' + numero });
  };

  /* options: { numeros, preset, aoProgresso, sinal } */
  lote.fechar = async function (options) {
    const opts = options || {};
    const cfg = NV.config.obter();
    const preset = opts.preset || NV.config.presetAtivo();
    const sinal = opts.sinal || NV.fluxo.criarSinal();
    const numeros = (opts.numeros || []).slice(0, cfg.lote.maximo);
    const resultados = [];

    for (let i = 0; i < numeros.length; i += 1) {
      if (sinal.cancelado) break;
      const numero = numeros[i];
      if (opts.aoProgresso) {
        opts.aoProgresso({ tipo: 'os', numero: numero, indice: i + 1, total: numeros.length });
      }
      let resultado;
      try {
        await lote.abrirOs(numero, cfg.tempos);
        await async.sleep(400);
        resultado = await NV.fluxo.fecharOS({
          preset: preset,
          sinal: sinal,
          execucaoSeca: false,
          aoProgresso: opts.aoProgresso
        });
      } catch (erro) {
        resultado = { ok: false, erro: String(erro.message || erro) };
      }
      resultado.numeroOs = resultado.numeroOs || numero;
      resultados.push(resultado);
      NV.log.info('Lote: OS ' + numero + (resultado.ok ? ' fechada' : ' falhou'), { erro: resultado.erro || null });

      if (!resultado.ok && cfg.lote.pararNoPrimeiroErro) break;
      if (i < numeros.length - 1) await async.sleep(cfg.lote.esperaEntreOs);
    }

    return {
      total: numeros.length,
      processadas: resultados.length,
      sucesso: resultados.filter((r) => r.ok).length,
      falhas: resultados.filter((r) => !r.ok),
      resultados: resultados
    };
  };

  NV.lote = lote;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/core/diagnostico.js ===== */
/*
 * Coletor de diagnóstico.
 * Objetivo: gerar um arquivo com a estrutura real do modal e as chamadas de rede
 * de um fechamento feito à mão. Com isso os seletores podem ser calibrados e,
 * no futuro, o fechamento pode ser feito direto pela API do Neovero.
 * Dados sensíveis (e-mail, CPF, telefone, tokens) são mascarados na exportação.
 */
(function (NV) {
  'use strict';

  const dom = NV.dom;
  const diagnostico = {};

  const LIMITE_CORPO = 4000;
  const LIMITE_HTML = 200000;
  const MAX_REQUISICOES = 200;

  let requisicoes = [];
  let gravando = false;
  let originalFetch = null;
  let originalOpen = null;
  let originalSend = null;

  function redigir(valor) {
    if (valor == null) return valor;
    return String(valor)
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '«email»')
      .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '«cpf»')
      .replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g, '«telefone»')
      .replace(/("(?:senha|password|token|authorization|access_token)"\s*:\s*)"[^"]*"/gi, '$1"«oculto»"');
  }
  diagnostico.redigir = redigir;

  function truncar(valor, limite) {
    if (valor == null) return null;
    const str = typeof valor === 'string' ? valor : (function () {
      try {
        return JSON.stringify(valor);
      } catch (erro) {
        return String(valor);
      }
    })();
    return str.length > limite ? str.slice(0, limite) + '…[truncado]' : str;
  }

  function registrarRequisicao(entrada) {
    if (!gravando) return;
    requisicoes.push(entrada);
    if (requisicoes.length > MAX_REQUISICOES) requisicoes.shift();
  }

  diagnostico.iniciarGravacao = function () {
    if (gravando) return false;
    requisicoes = [];
    gravando = true;

    originalFetch = window.fetch;
    window.fetch = async function (entrada, init) {
      const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
      const metodo = (init && init.method) || (entrada && entrada.method) || 'GET';
      const corpo = init && init.body ? truncar(redigir(init.body), LIMITE_CORPO) : null;
      const t0 = Date.now();
      const resposta = await originalFetch.apply(this, arguments);
      let amostra = null;
      try {
        amostra = truncar(redigir(await resposta.clone().text()), LIMITE_CORPO);
      } catch (erro) {
        amostra = null;
      }
      registrarRequisicao({
        via: 'fetch',
        metodo: metodo,
        url: redigir(url),
        corpo: corpo,
        status: resposta.status,
        resposta: amostra,
        ms: Date.now() - t0,
        t: new Date().toISOString()
      });
      return resposta;
    };

    originalOpen = XMLHttpRequest.prototype.open;
    originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (metodo, url) {
      this.__nv = { metodo: metodo, url: url, t0: Date.now() };
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (corpo) {
      const meta = this.__nv || {};
      const xhr = this;
      this.addEventListener('loadend', function () {
        let amostra = null;
        try {
          amostra = truncar(redigir(xhr.responseText), LIMITE_CORPO);
        } catch (erro) {
          amostra = null;
        }
        registrarRequisicao({
          via: 'xhr',
          metodo: meta.metodo || 'GET',
          url: redigir(meta.url || ''),
          corpo: corpo ? truncar(redigir(corpo), LIMITE_CORPO) : null,
          status: xhr.status,
          resposta: amostra,
          ms: Date.now() - (meta.t0 || Date.now()),
          t: new Date().toISOString()
        });
      });
      return originalSend.apply(this, arguments);
    };

    NV.log.info('Gravação de diagnóstico iniciada');
    return true;
  };

  diagnostico.pararGravacao = function () {
    if (!gravando) return false;
    gravando = false;
    if (originalFetch) window.fetch = originalFetch;
    if (originalOpen) XMLHttpRequest.prototype.open = originalOpen;
    if (originalSend) XMLHttpRequest.prototype.send = originalSend;
    NV.log.info('Gravação de diagnóstico encerrada', { requisicoes: requisicoes.length });
    return true;
  };

  diagnostico.gravando = function () {
    return gravando;
  };

  diagnostico.requisicoes = function () {
    return requisicoes.slice();
  };

  const ATTRS_UTEIS = ['id', 'class', 'name', 'type', 'role', 'aria-label', 'title', 'placeholder', 'data-testid', 'data-id', 'for', 'value'];

  function descreverArvore(el, profundidade, maximo) {
    if (!el || el.nodeType !== 1) return null;
    const attrs = {};
    ATTRS_UTEIS.forEach(function (attr) {
      const valor = el.getAttribute && el.getAttribute(attr);
      if (valor) attrs[attr] = redigir(valor).slice(0, 120);
    });
    const no = {
      tag: el.tagName.toLowerCase(),
      attrs: attrs,
      texto: redigir(dom.textoProprio(el)).slice(0, 120) || undefined,
      visivel: dom.visivel(el) || undefined
    };
    if (profundidade < maximo && el.children.length) {
      no.filhos = Array.prototype.slice.call(el.children, 0, 40).map(function (filho) {
        return descreverArvore(filho, profundidade + 1, maximo);
      });
    }
    return no;
  }

  function listarControles(raiz) {
    return dom.elementos(raiz)
      .filter(function (el) {
        return el.matches && el.matches(dom.CONTROLES);
      })
      .slice(0, 80)
      .map(function (el) {
        return {
          tag: el.tagName.toLowerCase(),
          tipo: el.getAttribute('type') || null,
          id: el.id || null,
          name: el.getAttribute('name') || null,
          role: el.getAttribute('role') || null,
          classe: (el.getAttribute('class') || '').slice(0, 120),
          valor: redigir(NV.campos.valorExibido(el)).slice(0, 120),
          caminhoCss: dom.caminhoCss(el),
          visivel: dom.visivel(el)
        };
      });
  }

  /* Fotografa a janela da OS e, se estiver aberto, o modal de ocorrência. */
  diagnostico.capturar = function (options) {
    const opts = options || {};
    const cfg = NV.config.obter();
    const janela = NV.localizar.janelaOs();
    const modal = NV.localizar.modalOcorrencia();
    const chaves = {};
    [
      ['botaoOcorrencia', () => NV.localizar.botaoOcorrencia(janela)],
      ['botaoFecharOs', () => NV.localizar.botaoFecharOs(janela)],
      ['botaoIniciarAtendimento', () => NV.localizar.botaoIniciarAtendimento(janela)],
      ['campoOcorrencia', () => modal && NV.localizar.campoOcorrencia(modal)],
      ['campoDataOcorrencia', () => modal && NV.localizar.campoDataOcorrencia(modal)],
      ['campoDataFinal', () => modal && NV.localizar.campoDataFinal(modal)],
      ['campoCausa', () => modal && NV.localizar.campoCausa(modal)],
      ['campoServico', () => modal && NV.localizar.campoServico(modal)],
      ['campoObservacao', () => modal && NV.localizar.campoObservacao(modal)],
      ['botaoSalvarModal', () => modal && NV.localizar.botaoSalvarModal(modal)]
    ].forEach(function (par) {
      let el = null;
      try {
        el = par[1]();
      } catch (erro) {
        el = null;
      }
      chaves[par[0]] = el ? { descricao: dom.descrever(el), caminhoCss: dom.caminhoCss(el) } : null;
    });

    return {
      gerado: new Date().toISOString(),
      versaoScript: NV.VERSAO,
      url: redigir(location.origin + location.pathname),
      titulo: redigir(document.title),
      navegador: navigator.userAgent,
      configuracao: {
        presets: cfg.presets,
        seletores: cfg.seletores,
        rotulos: cfg.rotulos,
        tempos: cfg.tempos,
        entradaDatas: cfg.entradaDatas
      },
      resolucaoDeSeletores: chaves,
      janelaOs: janela ? {
        numero: NV.localizar.numeroOs(janela),
        arvore: descreverArvore(janela, 0, 6),
        controles: listarControles(janela),
        html: opts.incluirHtml === false ? null : truncar(redigir(janela.outerHTML), LIMITE_HTML)
      } : null,
      modalOcorrencia: modal ? {
        arvore: descreverArvore(modal, 0, 8),
        controles: listarControles(modal),
        html: opts.incluirHtml === false ? null : truncar(redigir(modal.outerHTML), LIMITE_HTML)
      } : null,
      requisicoes: requisicoes,
      log: NV.log.entradas()
    };
  };

  diagnostico.baixar = function (dados, nome) {
    const conteudo = JSON.stringify(dados || diagnostico.capturar(), null, 2);
    const blob = new Blob([conteudo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome || 'neovero-diagnostico-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return a.download;
  };

  NV.diagnostico = diagnostico;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/ui/estilos.js ===== */
/* CSS do painel. Vive dentro de um shadow root para não brigar com o tema do Neovero. */
(function (NV) {
  'use strict';

  NV.estilos = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, "Segoe UI", Roboto, sans-serif; }

  .painel {
    position: fixed; right: 18px; bottom: 18px; z-index: 2147482000;
    width: 300px; background: #171a1f; color: #e8eaed;
    border: 1px solid #2c3138; border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,.45); overflow: hidden;
    font-size: 13px;
  }
  .painel.recolhido .corpo { display: none; }

  .cabecalho {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; background: #10b981; color: #06281f; cursor: move;
    font-weight: 700; letter-spacing: .2px;
  }
  .cabecalho .titulo { flex: 1; font-size: 13px; }
  .cabecalho button {
    background: rgba(0,0,0,.12); border: 0; color: inherit; cursor: pointer;
    width: 24px; height: 24px; border-radius: 6px; font-size: 14px; line-height: 1;
  }
  .cabecalho button:hover { background: rgba(0,0,0,.25); }

  .corpo { padding: 12px; display: grid; gap: 10px; }

  label.campo { display: grid; gap: 4px; font-size: 11px; text-transform: uppercase; color: #9aa4b2; letter-spacing: .4px; }
  select, input[type="text"], input[type="number"], textarea {
    width: 100%; background: #0f1216; color: #e8eaed; border: 1px solid #2c3138;
    border-radius: 8px; padding: 7px 9px; font-size: 13px;
  }
  textarea { min-height: 56px; resize: vertical; }
  select:focus, input:focus, textarea:focus { outline: 2px solid #10b981; outline-offset: -1px; }

  button.acao {
    border: 0; border-radius: 9px; padding: 10px 12px; font-size: 13px; font-weight: 700;
    cursor: pointer; background: #10b981; color: #06281f; width: 100%;
  }
  button.acao:hover { filter: brightness(1.08); }
  button.acao:disabled { opacity: .55; cursor: progress; }
  button.secundaria { background: #232830; color: #dfe3e8; font-weight: 600; }
  button.perigo { background: #7f1d1d; color: #fee2e2; }
  .linha { display: flex; gap: 6px; }
  .linha > * { flex: 1; }

  .status { font-size: 12px; color: #9aa4b2; min-height: 16px; line-height: 1.35; }
  .status.ok { color: #34d399; }
  .status.erro { color: #f87171; }
  .status.trabalhando { color: #fbbf24; }

  .aviso {
    background: #2a2210; border: 1px solid #7c5e10; color: #fde68a;
    padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4;
  }

  .sobreposicao {
    position: fixed; inset: 0; z-index: 2147482500; background: rgba(6,8,10,.65);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .modal {
    width: min(720px, 100%); max-height: 86vh; overflow: auto;
    background: #171a1f; color: #e8eaed; border: 1px solid #2c3138;
    border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.5);
  }
  .modal header {
    display: flex; align-items: center; gap: 10px; padding: 14px 16px;
    border-bottom: 1px solid #2c3138; font-weight: 700; position: sticky; top: 0; background: #171a1f;
  }
  .modal header .titulo { flex: 1; }
  .modal .conteudo { padding: 16px; display: grid; gap: 14px; }
  .modal footer { padding: 12px 16px; border-top: 1px solid #2c3138; display: flex; gap: 8px; justify-content: flex-end; }
  .modal footer button { width: auto; padding: 9px 16px; }

  .abas { display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid #2c3138; }
  .abas button {
    background: none; border: 0; color: #9aa4b2; padding: 10px 12px; cursor: pointer;
    font-size: 13px; font-weight: 600; border-bottom: 2px solid transparent;
  }
  .abas button.ativa { color: #10b981; border-bottom-color: #10b981; }

  .grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .grade3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  fieldset { border: 1px solid #2c3138; border-radius: 10px; padding: 12px; display: grid; gap: 10px; }
  legend { padding: 0 6px; font-size: 12px; text-transform: uppercase; color: #9aa4b2; letter-spacing: .4px; }

  label.check { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #dfe3e8; }
  label.check input { margin-top: 2px; }
  label.check small { display: block; color: #8b95a3; font-size: 11px; }

  ul.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 220px; overflow: auto; }
  ul.lista li {
    display: flex; align-items: center; gap: 8px; padding: 7px 9px;
    background: #0f1216; border: 1px solid #2c3138; border-radius: 8px; font-size: 12px;
  }
  ul.lista li .nome { flex: 1; }
  ul.lista li button { width: auto; padding: 5px 9px; font-size: 11px; }
  code { background: #0f1216; border: 1px solid #2c3138; border-radius: 5px; padding: 1px 5px; font-size: 11px; word-break: break-all; }

  pre.log {
    background: #0b0d10; border: 1px solid #2c3138; border-radius: 8px; padding: 10px;
    max-height: 320px; overflow: auto; font-size: 11px; line-height: 1.5;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap;
  }
  .log-erro { color: #f87171; }
  .log-aviso { color: #fbbf24; }
  .log-passo { color: #93c5fd; }

  .aviso-inline { font-size: 11px; color: #8b95a3; line-height: 1.45; }
  .badge { background: #232830; border-radius: 999px; padding: 2px 8px; font-size: 11px; color: #9aa4b2; }
  `;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/ui/aprender.js ===== */
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
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!el || el.closest('[data-nv-ui]')) return;
        const r = el.getBoundingClientRect();
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
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
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

      const limpar = function () {
        document.removeEventListener('mousemove', aoMover, true);
        document.removeEventListener('click', aoClicar, true);
        document.removeEventListener('keydown', aoTeclar, true);
        ui.camada.remove();
      };

      document.addEventListener('mousemove', aoMover, true);
      document.addEventListener('click', aoClicar, true);
      document.addEventListener('keydown', aoTeclar, true);
      ativo = { limpar: limpar };
    });
  };

  NV.aprender = aprender;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/ui/painel.js ===== */
/* Painel flutuante: preset ativo, botões de ação, configuração, log e lote. */
(function (NV) {
  'use strict';

  const painel = {};

  let host = null;
  let raiz = null;
  let refs = {};
  let ocupado = false;
  let sinalAtual = null;

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (html != null) node.innerHTML = html;
    return node;
  }

  function esc(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function status(mensagem, tipo) {
    if (!refs.status) return;
    refs.status.textContent = mensagem || '';
    refs.status.className = 'status' + (tipo ? ' ' + tipo : '');
  }

  function preencherPresets() {
    const cfg = NV.config.obter();
    refs.preset.innerHTML = cfg.presets
      .map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === cfg.presetAtivo ? ' selected' : '') + '>' + esc(p.nome) + '</option>';
      })
      .join('');
  }

  function definirOcupado(valor) {
    ocupado = valor;
    refs.btnFechar.textContent = valor ? 'Cancelar' : 'Fechar chamado';
    refs.btnFechar.classList.toggle('perigo', valor);
    [refs.btnSimular, refs.btnOcorrencia, refs.btnLote].forEach(function (b) {
      b.disabled = valor;
    });
  }

  function aoProgresso(evento) {
    if (evento.tipo === 'inicio') status('… ' + evento.passo, 'trabalhando');
    else if (evento.tipo === 'erro') status('✗ ' + evento.passo, 'erro');
    else if (evento.tipo === 'pulado') status('· ' + evento.passo + ' (ignorado)', 'trabalhando');
    else if (evento.tipo === 'os') status('OS ' + evento.numero + ' (' + evento.indice + '/' + evento.total + ')', 'trabalhando');
  }

  function resumoDeErro(resultado) {
    const partes = [];
    if (resultado.passo) partes.push(resultado.passo);
    if (resultado.erro) partes.push(resultado.erro);
    if (resultado.mensagemDaAplicacao) partes.push('Sistema: ' + resultado.mensagemDaAplicacao);
    return partes.join(' — ');
  }

  async function executar(opcoes) {
    if (ocupado) {
      if (sinalAtual) sinalAtual.cancelar();
      status('Cancelando…', 'trabalhando');
      return;
    }
    sinalAtual = NV.fluxo.criarSinal();
    definirOcupado(true);
    try {
      const resultado = await NV.fluxo.fecharOS(
        Object.assign(
          {
            preset: NV.config.presetAtivo(),
            aoProgresso: aoProgresso,
            sinal: sinalAtual,
            aoConfirmar: confirmarFechamento
          },
          opcoes || {}
        )
      );
      if (resultado.ok && resultado.execucaoSeca) {
        status('✓ Simulação: modal preenchido. Confira e salve manualmente.', 'ok');
      } else if (resultado.ok && resultado.fechada) {
        status('✓ OS ' + (resultado.numeroOs || '') + ' fechada em ' + (resultado.ms / 1000).toFixed(1) + 's', 'ok');
      } else if (resultado.ok) {
        status('✓ Ocorrência lançada' + (resultado.numeroOs ? ' na OS ' + resultado.numeroOs : ''), 'ok');
      } else {
        status('✗ ' + resumoDeErro(resultado), 'erro');
      }
      return resultado;
    } catch (erro) {
      status('✗ ' + String(erro.message || erro), 'erro');
    } finally {
      definirOcupado(false);
      sinalAtual = null;
    }
  }

  /* ---------------- diálogos simples dentro do shadow root ---------------- */

  function abrirSobreposicao(titulo, conteudoHtml, rodapeHtml) {
    const sobre = el('div', { class: 'sobreposicao' });
    sobre.innerHTML =
      '<div class="modal">' +
      '<header><span class="titulo">' + esc(titulo) + '</span><button class="acao secundaria" data-fechar style="width:auto;padding:6px 12px">✕</button></header>' +
      '<div class="conteudo"></div>' +
      (rodapeHtml ? '<footer>' + rodapeHtml + '</footer>' : '') +
      '</div>';
    sobre.querySelector('.conteudo').innerHTML = conteudoHtml;
    sobre.addEventListener('click', function (ev) {
      if (ev.target === sobre || (ev.target.dataset && ev.target.dataset.fechar !== undefined)) sobre.remove();
    });
    raiz.appendChild(sobre);
    return sobre;
  }

  function confirmar(titulo, mensagem, textoOk) {
    return new Promise(function (resolve) {
      const sobre = abrirSobreposicao(
        titulo,
        '<p style="margin:0;line-height:1.5">' + mensagem + '</p>',
        '<button class="acao secundaria" data-nao>Não</button><button class="acao" data-sim>' + esc(textoOk || 'Confirmar') + '</button>'
      );
      const fechar = function (valor) {
        sobre.remove();
        resolve(valor);
      };
      sobre.querySelector('[data-sim]').addEventListener('click', () => fechar(true));
      sobre.querySelector('[data-nao]').addEventListener('click', () => fechar(false));
      sobre.addEventListener('click', function (ev) {
        if (ev.target === sobre) fechar(false);
      });
    });
  }

  function confirmarFechamento(info) {
    return confirmar(
      'Fechar a OS?',
      'A ocorrência foi lançada' +
        (info.numeroOs ? ' na OS <b>' + esc(info.numeroOs) + '</b>' : '') +
        '.<br>Confirmar o fechamento da Ordem de Serviço?',
      'Fechar OS'
    );
  }

  /* ---------------- log ---------------- */

  function abrirLog() {
    const linhas = NV.log
      .entradas()
      .map(function (e) {
        const hora = e.t.slice(11, 19);
        const dados = e.dados ? ' ' + JSON.stringify(e.dados) : '';
        return '<span class="log-' + e.nivel + '">' + esc(hora + ' [' + e.nivel + '] ' + e.mensagem + dados) + '</span>';
      })
      .join('\n');
    const sobre = abrirSobreposicao(
      'Log da sessão',
      '<pre class="log">' + (linhas || 'Sem registros ainda.') + '</pre>',
      '<button class="acao secundaria" data-limpar>Limpar</button><button class="acao" data-copiar>Copiar</button>'
    );
    sobre.querySelector('[data-copiar]').addEventListener('click', function () {
      const texto = NV.log
        .entradas()
        .map((e) => e.t + ' [' + e.nivel + '] ' + e.mensagem + (e.dados ? ' ' + JSON.stringify(e.dados) : ''))
        .join('\n');
      navigator.clipboard.writeText(texto).then(
        () => status('Log copiado', 'ok'),
        () => status('Não foi possível copiar', 'erro')
      );
    });
    sobre.querySelector('[data-limpar]').addEventListener('click', function () {
      NV.log.limpar();
      sobre.remove();
      status('Log limpo');
    });
  }

  /* ---------------- lote ---------------- */

  async function abrirLote() {
    const cfg = NV.config.obter();
    const itens = NV.lote.listar();
    if (!itens.length) {
      status('Nenhuma OS encontrada na lista do Monitor de Atendimento', 'erro');
      return;
    }
    const html =
      '<div class="aviso">O modo lote abre cada OS, lança a ocorrência do preset e fecha. ' +
      'Confirme antes que o preset é o correto para <b>todas</b> as OS marcadas.</div>' +
      '<label class="campo">Preset aplicado a todas<span class="badge">' + esc((NV.config.presetAtivo() || {}).nome || '—') + '</span></label>' +
      '<ul class="lista">' +
      itens
        .map(function (i) {
          return '<li><input type="checkbox" value="' + esc(i.numero) + '"><span class="nome">OS ' + esc(i.numero) + '</span></li>';
        })
        .join('') +
      '</ul>' +
      '<label class="check"><input type="checkbox" data-parar ' + (cfg.lote.pararNoPrimeiroErro ? 'checked' : '') +
      '> Parar no primeiro erro</label>';

    const sobre = abrirSobreposicao(
      'Fechar em lote',
      html,
      '<button class="acao secundaria" data-fechar>Cancelar</button><button class="acao" data-executar>Fechar selecionadas</button>'
    );

    sobre.querySelector('[data-executar]').addEventListener('click', async function () {
      const numeros = Array.prototype.slice
        .call(sobre.querySelectorAll('ul.lista input[type="checkbox"]:checked'))
        .map((c) => c.value);
      if (!numeros.length) return;
      NV.config.aplicar({ lote: { pararNoPrimeiroErro: sobre.querySelector('[data-parar]').checked } });
      const ok = await confirmar('Confirmar lote', 'Serão fechadas <b>' + numeros.length + '</b> OS com o preset atual. Continuar?', 'Executar');
      if (!ok) return;
      sobre.remove();
      sinalAtual = NV.fluxo.criarSinal();
      definirOcupado(true);
      try {
        const resumo = await NV.lote.fechar({ numeros: numeros, aoProgresso: aoProgresso, sinal: sinalAtual });
        status(
          '✓ ' + resumo.sucesso + '/' + resumo.total + ' fechadas' + (resumo.falhas.length ? ' · ' + resumo.falhas.length + ' falha(s), veja o log' : ''),
          resumo.falhas.length ? 'erro' : 'ok'
        );
      } finally {
        definirOcupado(false);
        sinalAtual = null;
      }
    });
  }

  /* ---------------- configuração ---------------- */

  const CHAVES_SELETOR = [
    ['botaoOcorrencia', 'Botão "Ocorrência" (na OS)'],
    ['botaoFecharOs', 'Botão "Fechar OS"'],
    ['botaoIniciarAtendimento', 'Botão "Iniciar Atendimento"'],
    ['modalOcorrencia', 'Modal "Nova Ocorrência"'],
    ['campoOcorrencia', 'Campo Ocorrência'],
    ['campoDataOcorrencia', 'Campo Data da Ocorrência'],
    ['campoDataFinal', 'Campo Data Final do Serviço'],
    ['campoCausa', 'Campo Causa'],
    ['campoServico', 'Campo Serviço'],
    ['campoObservacao', 'Campo Observação'],
    ['botaoSalvarModal', 'Botão "Salvar" do modal']
  ];

  function htmlAbaPresets(cfg) {
    return (
      '<label class="campo">Preset em edição' +
      '<select data-preset-edit>' +
      cfg.presets.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.nome) + '</option>').join('') +
      '</select></label>' +
      '<fieldset><legend>Dados da ocorrência</legend>' +
      '<label class="campo">Nome do preset<input type="text" data-f="nome"></label>' +
      '<div class="grade2">' +
      '<label class="campo">Ocorrência (obrigatório)<input type="text" data-f="ocorrencia" placeholder="SUPORTE - TI"></label>' +
      '<label class="campo">Serviço (obrigatório)<input type="text" data-f="servico" placeholder="CONFIGURAÇÃO DE EQUIPAMENTOS"></label>' +
      '</div>' +
      '<div class="grade2">' +
      '<label class="campo">Causa (opcional)<input type="text" data-f="causa"></label>' +
      '<label class="campo">Interno/Externo<select data-f="local"><option value="interno">Interno</option><option value="externo">Externo</option><option value="">Não alterar</option></select></label>' +
      '</div>' +
      '<label class="campo">Observação (opcional)<textarea data-f="observacao"></textarea></label>' +
      '</fieldset>' +
      '<fieldset><legend>Datas</legend>' +
      '<div class="grade2">' +
      '<label class="campo">Regra<select data-f="datas.modo">' +
      '<option value="agora">Terminou agora (início = agora − duração)</option>' +
      '<option value="inicioAgora">Começa agora (fim = agora + duração)</option>' +
      '<option value="abertura">Início na abertura da OS, fim agora</option>' +
      '</select></label>' +
      '<label class="campo">Duração (min)<input type="number" min="0" max="1440" data-f="datas.duracaoMin"></label>' +
      '</div>' +
      '<p class="aviso-inline">O padrão reproduz o que você faz hoje: ocorrência de 1 minuto terminando no momento do fechamento.</p>' +
      '</fieldset>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-novo>Novo preset</button>' +
      '<button class="acao secundaria" data-duplicar>Duplicar</button>' +
      '<button class="acao perigo" data-excluir>Excluir</button>' +
      '</div>'
    );
  }

  function htmlAbaComportamento(cfg) {
    const check = function (chave, titulo, ajuda) {
      const valor = chave.split('.').reduce((o, k) => (o || {})[k], cfg);
      return (
        '<label class="check"><input type="checkbox" data-c="' + chave + '"' + (valor ? ' checked' : '') + '>' +
        '<span>' + esc(titulo) + (ajuda ? '<small>' + esc(ajuda) + '</small>' : '') + '</span></label>'
      );
    };
    return (
      '<fieldset><legend>Fluxo</legend>' +
      check('fecharOsAposOcorrencia', 'Fechar a OS depois de lançar a ocorrência', 'Desmarque para só lançar a ocorrência.') +
      check('confirmarAntesDeFechar', 'Pedir confirmação antes de clicar em "Fechar OS"') +
      check('autoIniciarAtendimento', 'Clicar em "Iniciar Atendimento" quando o botão estiver visível') +
      check('salvarOsAntesDeFechar', 'Salvar a OS antes de fechar') +
      check('execucaoSeca', 'Modo simulação por padrão', 'Preenche o modal e para antes de salvar.') +
      check('logNoConsole', 'Espelhar log no console do navegador') +
      '</fieldset>' +
      '<fieldset><legend>Compatibilidade</legend>' +
      check('fecharCalendarioComEsc', 'Fechar calendário com Esc depois de escrever a data', 'Desmarque se o Esc fechar o modal inteiro.') +
      '<label class="campo">Escrita nos campos de data<select data-c="entradaDatas">' +
      ['auto', 'valor', 'teclas']
        .map((v) => '<option value="' + v + '"' + (cfg.entradaDatas === v ? ' selected' : '') + '>' + v + '</option>')
        .join('') +
      '</select></label>' +
      '<p class="aviso-inline">"auto" tenta escrever direto e, se o campo tiver máscara, digita tecla por tecla.</p>' +
      '<div class="grade3">' +
      '<label class="campo">Timeout elemento (ms)<input type="number" data-c="tempos.elemento" value="' + cfg.tempos.elemento + '"></label>' +
      '<label class="campo">Timeout modal (ms)<input type="number" data-c="tempos.modal" value="' + cfg.tempos.modal + '"></label>' +
      '<label class="campo">Timeout salvar (ms)<input type="number" data-c="tempos.salvar" value="' + cfg.tempos.salvar + '"></label>' +
      '</div>' +
      '</fieldset>' +
      '<fieldset><legend>Lote</legend>' +
      '<div class="grade3">' +
      '<label class="campo">Máx. por lote<input type="number" data-c="lote.maximo" value="' + cfg.lote.maximo + '"></label>' +
      '<label class="campo">Espera entre OS (ms)<input type="number" data-c="lote.esperaEntreOs" value="' + cfg.lote.esperaEntreOs + '"></label>' +
      '<label class="campo">&nbsp;' + check('lote.pararNoPrimeiroErro', 'Parar no 1º erro') + '</label>' +
      '</div>' +
      '</fieldset>' +
      '<fieldset><legend>Atalhos</legend>' +
      '<div class="grade3">' +
      '<label class="campo">Fechar chamado<input type="text" data-c="atalhos.fechar" value="' + esc(cfg.atalhos.fechar) + '"></label>' +
      '<label class="campo">Lote<input type="text" data-c="atalhos.lote" value="' + esc(cfg.atalhos.lote) + '"></label>' +
      '<label class="campo">Mostrar painel<input type="text" data-c="atalhos.painel" value="' + esc(cfg.atalhos.painel) + '"></label>' +
      '</div>' +
      '<p class="aviso-inline">Formato: Alt+F, Ctrl+Shift+K, etc.</p>' +
      '</fieldset>'
    );
  }

  function htmlAbaSeletores(cfg) {
    return (
      '<div class="aviso">Use isto quando o script não achar um botão ou campo: clique em "Aprender" e depois no elemento real na tela do Neovero.</div>' +
      '<ul class="lista" style="max-height:none">' +
      CHAVES_SELETOR.map(function (par) {
        const atual = (cfg.seletores || {})[par[0]];
        return (
          '<li><span class="nome">' + esc(par[1]) +
          (atual ? '<br><code>' + esc(atual) + '</code>' : '<br><span class="aviso-inline">automático (por texto)</span>') +
          '</span>' +
          '<button class="acao secundaria" data-aprender="' + par[0] + '">Aprender</button>' +
          (atual ? '<button class="acao perigo" data-limpar-seletor="' + par[0] + '">Limpar</button>' : '') +
          '</li>'
        );
      }).join('') +
      '</ul>'
    );
  }

  function htmlAbaDiagnostico(cfg) {
    const gravando = NV.diagnostico.gravando();
    return (
      '<fieldset><legend>Coleta para ajuste fino</legend>' +
      '<p class="aviso-inline">1) Clique em "Iniciar gravação". 2) Faça um fechamento manual completo. ' +
      '3) Clique em "Parar e baixar". O arquivo contém a estrutura do modal e as chamadas de rede ' +
      '(e-mails, CPF, telefones e tokens são mascarados). Envie esse arquivo para calibrar os seletores ' +
      'ou implementar o fechamento direto pela API.</p>' +
      '<div class="linha">' +
      '<button class="acao ' + (gravando ? 'perigo' : 'secundaria') + '" data-gravar>' + (gravando ? 'Parar e baixar' : 'Iniciar gravação') + '</button>' +
      '<button class="acao secundaria" data-capturar>Capturar tela atual</button>' +
      '</div>' +
      '</fieldset>' +
      '<fieldset><legend>Este site</legend>' +
      '<p class="aviso-inline">Host atual: <code>' + esc(location.host) + '</code></p>' +
      '<label class="check"><input type="checkbox" data-host ' + (cfg.hostsLiberados.indexOf(location.host) >= 0 ? 'checked' : '') +
      '><span>Tratar este host como Neovero<small>Marque se o painel não aparecer sozinho.</small></span></label>' +
      '</fieldset>' +
      '<fieldset><legend>Configuração</legend>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-exportar>Exportar configuração</button>' +
      '<button class="acao secundaria" data-importar>Importar</button>' +
      '<button class="acao perigo" data-restaurar>Restaurar padrão</button>' +
      '</div>' +
      '</fieldset>'
    );
  }

  function abrirConfig() {
    const cfg = NV.config.obter();
    const abas = [
      ['presets', 'Presets', htmlAbaPresets],
      ['comportamento', 'Comportamento', htmlAbaComportamento],
      ['seletores', 'Seletores', htmlAbaSeletores],
      ['diagnostico', 'Diagnóstico', htmlAbaDiagnostico]
    ];

    const sobre = el('div', { class: 'sobreposicao' });
    sobre.innerHTML =
      '<div class="modal">' +
      '<header><span class="titulo">Configuração · Neovero+</span>' +
      '<button class="acao secundaria" data-fechar style="width:auto;padding:6px 12px">✕</button></header>' +
      '<div class="abas">' +
      abas.map((a, i) => '<button data-aba="' + a[0] + '" class="' + (i === 0 ? 'ativa' : '') + '">' + a[1] + '</button>').join('') +
      '</div>' +
      '<div class="conteudo" data-painel-aba></div>' +
      '<footer><button class="acao secundaria" data-fechar>Fechar</button><button class="acao" data-salvar>Salvar</button></footer>' +
      '</div>';
    raiz.appendChild(sobre);

    const conteudo = sobre.querySelector('[data-painel-aba]');
    let abaAtual = 'presets';
    let presetEmEdicao = (NV.config.presetAtivo() || {}).id;

    function valorPorCaminho(objeto, caminho) {
      return caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), objeto);
    }

    function definirPorCaminho(objeto, caminho, valor) {
      const partes = caminho.split('.');
      let atual = objeto;
      for (let i = 0; i < partes.length - 1; i += 1) {
        if (typeof atual[partes[i]] !== 'object' || atual[partes[i]] === null) atual[partes[i]] = {};
        atual = atual[partes[i]];
      }
      atual[partes[partes.length - 1]] = valor;
    }

    function carregarFormularioPreset() {
      const preset = NV.config.obter().presets.find((p) => p.id === presetEmEdicao) || NV.config.obter().presets[0];
      if (!preset) return;
      presetEmEdicao = preset.id;
      const seletor = conteudo.querySelector('[data-preset-edit]');
      if (seletor) seletor.value = preset.id;
      conteudo.querySelectorAll('[data-f]').forEach(function (campo) {
        const valor = valorPorCaminho(preset, campo.dataset.f);
        campo.value = valor == null ? '' : valor;
      });
    }

    function coletarPreset() {
      const base = NV.config.obter().presets.find((p) => p.id === presetEmEdicao) || { id: presetEmEdicao };
      const preset = NV.config.clonar(base);
      conteudo.querySelectorAll('[data-f]').forEach(function (campo) {
        const caminho = campo.dataset.f;
        let valor = campo.value;
        if (campo.type === 'number') valor = Number(valor);
        definirPorCaminho(preset, caminho, valor);
      });
      return preset;
    }

    function coletarComportamento() {
      const mudancas = {};
      conteudo.querySelectorAll('[data-c]').forEach(function (campo) {
        const caminho = campo.dataset.c;
        let valor;
        if (campo.type === 'checkbox') valor = campo.checked;
        else if (campo.type === 'number') valor = Number(campo.value);
        else valor = campo.value;
        definirPorCaminho(mudancas, caminho, valor);
      });
      return mudancas;
    }

    function renderAba(nome) {
      abaAtual = nome;
      const def = abas.find((a) => a[0] === nome);
      conteudo.innerHTML = def[2](NV.config.obter());
      sobre.querySelectorAll('[data-aba]').forEach(function (b) {
        b.classList.toggle('ativa', b.dataset.aba === nome);
      });
      if (nome === 'presets') carregarFormularioPreset();
    }

    function salvarAbaAtual() {
      if (abaAtual === 'presets') {
        const preset = coletarPreset();
        const erros = NV.config.validarPreset(preset);
        if (erros.length) {
          status('✗ ' + erros.join(' '), 'erro');
          return false;
        }
        NV.config.salvarPreset(preset);
        preencherPresets();
        status('Preset salvo: ' + preset.nome, 'ok');
        return true;
      }
      if (abaAtual === 'comportamento') {
        NV.config.aplicar(coletarComportamento());
        NV.log.console = NV.config.obter().logNoConsole;
        status('Configuração salva', 'ok');
        return true;
      }
      if (abaAtual === 'diagnostico') {
        const check = conteudo.querySelector('[data-host]');
        if (check) {
          const cfgAtual = NV.config.obter();
          const lista = cfgAtual.hostsLiberados.filter((h) => h !== location.host);
          if (check.checked) lista.push(location.host);
          NV.config.aplicar({ hostsLiberados: lista });
        }
        status('Configuração salva', 'ok');
        return true;
      }
      return true;
    }

    sobre.addEventListener('click', async function (ev) {
      const alvo = ev.target;
      if (alvo === sobre || (alvo.dataset && alvo.dataset.fechar !== undefined)) {
        sobre.remove();
        return;
      }
      if (alvo.dataset && alvo.dataset.aba) {
        salvarAbaAtual();
        renderAba(alvo.dataset.aba);
        return;
      }
      if (alvo.dataset && alvo.dataset.salvar !== undefined) {
        if (salvarAbaAtual()) sobre.remove();
        return;
      }
      if (alvo.dataset && alvo.dataset.novo !== undefined) {
        const novo = {
          id: NV.config.gerarId('novo'),
          nome: 'Novo preset',
          ocorrencia: '',
          servico: '',
          causa: '',
          local: 'interno',
          observacao: '',
          datas: { modo: 'agora', duracaoMin: 1 }
        };
        const cfgAtual = NV.config.obter();
        NV.config.salvar(Object.assign({}, cfgAtual, { presets: cfgAtual.presets.concat([novo]) }));
        presetEmEdicao = novo.id;
        renderAba('presets');
        preencherPresets();
        return;
      }
      if (alvo.dataset && alvo.dataset.duplicar !== undefined) {
        const atual = coletarPreset();
        const copia = Object.assign({}, atual, { id: NV.config.gerarId(atual.nome), nome: atual.nome + ' (cópia)' });
        NV.config.salvarPreset(copia);
        presetEmEdicao = copia.id;
        renderAba('presets');
        preencherPresets();
        return;
      }
      if (alvo.dataset && alvo.dataset.excluir !== undefined) {
        const ok = await confirmar('Excluir preset', 'Remover este preset da lista?', 'Excluir');
        if (!ok) return;
        NV.config.removerPreset(presetEmEdicao);
        presetEmEdicao = (NV.config.presetAtivo() || {}).id;
        renderAba('presets');
        preencherPresets();
        return;
      }
      if (alvo.dataset && alvo.dataset.aprender) {
        const chave = alvo.dataset.aprender;
        const rotulo = (CHAVES_SELETOR.find((p) => p[0] === chave) || [])[1] || chave;
        sobre.style.display = 'none';
        const resultado = await NV.aprender.iniciar(chave, rotulo);
        sobre.style.display = '';
        renderAba('seletores');
        status(resultado ? '✓ Seletor gravado: ' + rotulo : 'Aprendizado cancelado', resultado ? 'ok' : null);
        return;
      }
      if (alvo.dataset && alvo.dataset.limparSeletor) {
        NV.config.definirSeletor(alvo.dataset.limparSeletor, null);
        renderAba('seletores');
        return;
      }
      if (alvo.dataset && alvo.dataset.gravar !== undefined) {
        if (NV.diagnostico.gravando()) {
          NV.diagnostico.pararGravacao();
          const nome = NV.diagnostico.baixar();
          status('✓ Diagnóstico salvo: ' + nome, 'ok');
        } else {
          NV.diagnostico.iniciarGravacao();
          status('Gravando… faça o fechamento manual e volte aqui', 'trabalhando');
        }
        renderAba('diagnostico');
        return;
      }
      if (alvo.dataset && alvo.dataset.capturar !== undefined) {
        const nome = NV.diagnostico.baixar();
        status('✓ Captura salva: ' + nome, 'ok');
        return;
      }
      if (alvo.dataset && alvo.dataset.exportar !== undefined) {
        NV.diagnostico.baixar(NV.config.obter(), 'neovero-config.json');
        status('✓ Configuração exportada', 'ok');
        return;
      }
      if (alvo.dataset && alvo.dataset.importar !== undefined) {
        const entrada = document.createElement('input');
        entrada.type = 'file';
        entrada.accept = 'application/json';
        entrada.addEventListener('change', function () {
          const arquivo = entrada.files && entrada.files[0];
          if (!arquivo) return;
          const leitor = new FileReader();
          leitor.onload = function () {
            try {
              NV.config.salvar(JSON.parse(String(leitor.result)));
              preencherPresets();
              renderAba(abaAtual);
              status('✓ Configuração importada', 'ok');
            } catch (erro) {
              status('✗ Arquivo inválido', 'erro');
            }
          };
          leitor.readAsText(arquivo);
        });
        entrada.click();
        return;
      }
      if (alvo.dataset && alvo.dataset.restaurar !== undefined) {
        const ok = await confirmar('Restaurar padrão', 'Isso apaga presets e seletores personalizados. Continuar?', 'Restaurar');
        if (!ok) return;
        NV.config.restaurarPadrao();
        presetEmEdicao = (NV.config.presetAtivo() || {}).id;
        preencherPresets();
        renderAba(abaAtual);
        status('Configuração restaurada', 'ok');
      }
    });

    conteudo.addEventListener('change', function (ev) {
      if (ev.target.dataset && ev.target.dataset.presetEdit !== undefined) {
        presetEmEdicao = ev.target.value;
        carregarFormularioPreset();
      }
    });

    renderAba('presets');
    return sobre;
  }

  /* ---------------- arrastar ---------------- */

  let arrastando = false;
  let dx = 0;
  let dy = 0;
  let globaisRegistrados = false;

  function habilitarArrasto() {
    refs.cabecalho.addEventListener('mousedown', function (ev) {
      if (ev.target.tagName === 'BUTTON') return;
      const r = refs.painel.getBoundingClientRect();
      arrastando = true;
      dx = ev.clientX - r.left;
      dy = ev.clientY - r.top;
      ev.preventDefault();
    });
    if (globaisRegistrados) return;
    window.addEventListener('mousemove', function (ev) {
      if (!arrastando) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx));
      const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
      refs.painel.style.left = x + 'px';
      refs.painel.style.top = y + 'px';
      refs.painel.style.right = 'auto';
      refs.painel.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', function () {
      if (!arrastando) return;
      arrastando = false;
      const r = refs.painel.getBoundingClientRect();
      NV.config.aplicar({ painel: { x: r.left, y: r.top } });
    });
  }

  /* ---------------- atalhos ---------------- */

  function combinacaoBate(ev, combinacao) {
    if (!combinacao) return false;
    const partes = combinacao.toLowerCase().split('+').map((p) => p.trim());
    const tecla = partes[partes.length - 1];
    const precisaAlt = partes.indexOf('alt') >= 0;
    const precisaCtrl = partes.indexOf('ctrl') >= 0 || partes.indexOf('control') >= 0;
    const precisaShift = partes.indexOf('shift') >= 0;
    if (ev.altKey !== precisaAlt) return false;
    if (ev.ctrlKey !== precisaCtrl) return false;
    if (ev.shiftKey !== precisaShift) return false;
    return String(ev.key || '').toLowerCase() === tecla;
  }

  function registrarAtalhos() {
    if (globaisRegistrados) return;
    window.addEventListener(
      'keydown',
      function (ev) {
        /* O próprio script dispara Escape para fechar calendários; só tecla real conta. */
        if (ev.isTrusted === false) return;
        const cfg = NV.config.obter();
        if (combinacaoBate(ev, cfg.atalhos.fechar)) {
          ev.preventDefault();
          executar({});
        } else if (combinacaoBate(ev, cfg.atalhos.lote)) {
          ev.preventDefault();
          abrirLote();
        } else if (combinacaoBate(ev, cfg.atalhos.painel)) {
          ev.preventDefault();
          painel.alternar();
        } else if (ev.key === 'Escape' && ocupado && sinalAtual) {
          sinalAtual.cancelar();
          status('Cancelando…', 'trabalhando');
        }
      },
      true
    );
  }

  /* ---------------- montagem ---------------- */

  /* A SPA pode substituir o body inteiro e levar o painel embora: nesse caso remonta. */
  painel.montado = function () {
    return !!host && host.isConnected;
  };

  painel.montar = function () {
    if (painel.montado()) return painel;
    host = null;
    raiz = null;
    refs = {};
    const cfg = NV.config.obter();

    host = el('div', { 'data-nv-ui': 'painel' });
    document.body.appendChild(host);
    raiz = host.attachShadow({ mode: 'open' });
    const estilo = document.createElement('style');
    estilo.textContent = NV.estilos;
    raiz.appendChild(estilo);

    const container = el('div', { class: 'painel' + (cfg.painel.recolhido ? ' recolhido' : '') });
    container.innerHTML =
      '<div class="cabecalho" data-cabecalho>' +
      '<span class="titulo">Neovero+ · fechar chamado</span>' +
      '<button data-config title="Configuração">⚙</button>' +
      '<button data-recolher title="Recolher">–</button>' +
      '</div>' +
      '<div class="corpo">' +
      '<label class="campo">Preset<select data-preset></select></label>' +
      '<button class="acao" data-fechar-chamado>Fechar chamado</button>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-simular title="Preenche o modal e para antes de salvar">Simular</button>' +
      '<button class="acao secundaria" data-so-ocorrencia title="Lança a ocorrência sem fechar a OS">Só ocorrência</button>' +
      '</div>' +
      '<div class="linha">' +
      '<button class="acao secundaria" data-lote>Lote</button>' +
      '<button class="acao secundaria" data-log>Log</button>' +
      '</div>' +
      '<div class="status" data-status></div>' +
      '</div>';
    raiz.appendChild(container);

    refs = {
      painel: container,
      cabecalho: container.querySelector('[data-cabecalho]'),
      preset: container.querySelector('[data-preset]'),
      btnFechar: container.querySelector('[data-fechar-chamado]'),
      btnSimular: container.querySelector('[data-simular]'),
      btnOcorrencia: container.querySelector('[data-so-ocorrencia]'),
      btnLote: container.querySelector('[data-lote]'),
      btnLog: container.querySelector('[data-log]'),
      status: container.querySelector('[data-status]')
    };

    if (cfg.painel.x != null && cfg.painel.y != null) {
      container.style.left = cfg.painel.x + 'px';
      container.style.top = cfg.painel.y + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }

    preencherPresets();
    refs.preset.addEventListener('change', function () {
      NV.config.definirPresetAtivo(refs.preset.value);
      status('Preset: ' + refs.preset.selectedOptions[0].textContent);
    });
    refs.btnFechar.addEventListener('click', () => executar({}));
    refs.btnSimular.addEventListener('click', () => executar({ execucaoSeca: true }));
    refs.btnOcorrencia.addEventListener('click', () => executar({ apenasOcorrencia: true }));
    refs.btnLote.addEventListener('click', abrirLote);
    refs.btnLog.addEventListener('click', abrirLog);
    container.querySelector('[data-config]').addEventListener('click', abrirConfig);
    container.querySelector('[data-recolher]').addEventListener('click', function () {
      const recolhido = container.classList.toggle('recolhido');
      NV.config.aplicar({ painel: { recolhido: recolhido } });
    });

    habilitarArrasto();
    registrarAtalhos();
    globaisRegistrados = true;
    status('Pronto. Abra uma OS e clique em Fechar chamado (' + cfg.atalhos.fechar + ').');
    return painel;
  };

  painel.alternar = function () {
    if (!host) return;
    refs.painel.classList.toggle('recolhido');
  };

  painel.status = status;
  painel.abrirConfig = abrirConfig;
  painel.executar = executar;

  NV.painel = painel;
})((globalThis.NV = globalThis.NV || {}));

/* ===== src/main.js ===== */
/* Ponto de entrada: detecta se a página é o Neovero e monta o painel. */
(function (NV) {
  'use strict';

  NV.VERSAO = '0.1.0';

  function pareceNeovero() {
    const cfg = NV.config.obter();
    if (cfg.hostsLiberados.indexOf(location.host) >= 0) return true;
    if (/neovero/i.test(location.hostname)) return true;
    if (/neovero/i.test(document.title)) return true;
    const corpo = (document.body && document.body.innerText) || '';
    if (/neovero/i.test(corpo)) return true;
    return /monitor de atendimento/i.test(corpo) && /ordem de servi/i.test(corpo);
  }

  /* O script roda em todos os frames; só um painel deve aparecer. */
  function jaMontadoEmOutroFrame() {
    try {
      return !!window.top.__neoveroMaisMontado;
    } catch (erro) {
      return false;
    }
  }

  function marcarMontado() {
    try {
      window.top.__neoveroMaisMontado = true;
    } catch (erro) {
      /* frame de outra origem: segue sem marcar */
    }
  }

  async function iniciar() {
    NV.config.carregar();
    NV.log.console = NV.config.obter().logNoConsole;

    if (!document.body) {
      await new Promise(function (resolve) {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }

    /* Dá preferência ao frame principal: subframes esperam um pouco mais. */
    if (window !== window.top) await NV.async.sleep(4000);

    /* A aplicação é uma SPA: a tela pode levar alguns segundos para existir. */
    const limite = Date.now() + 60000;
    while (Date.now() < limite) {
      if (pareceNeovero() && !jaMontadoEmOutroFrame()) {
        marcarMontado();
        NV.painel.montar();
        NV.log.info('Neovero+ ativo', { versao: NV.VERSAO, host: location.host });
        globalThis.NeoveroMais = NV;
        /* Se a aplicação trocar o conteúdo da página, o painel é remontado. */
        setInterval(function () {
          if (!NV.painel.montado() && pareceNeovero()) NV.painel.montar();
        }, 5000);
        return;
      }
      await NV.async.sleep(1500);
    }
    NV.log.info('Neovero não detectado nesta página; painel não foi montado');
    globalThis.NeoveroMais = NV;
  }

  iniciar().catch(function (erro) {
    console.error('[Neovero+] falha ao iniciar', erro);
  });
})((globalThis.NV = globalThis.NV || {}));

})();
