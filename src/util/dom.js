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

  /*
   * Painéis de opções dos componentes mais comuns. O Neovero roda sobre ASP.NET,
   * então os kits Kendo/Telerik/DevExpress entram na lista junto com os de Angular.
   */
  const PAINEIS_DROPDOWN = [
    '[role="listbox"]',
    '[role="menu"]',
    '.dropdown-menu',
    '.select2-results',
    '.select2-dropdown',
    '.chosen-drop',
    '.ng-dropdown-panel',
    '.ui-select-choices',
    '.mat-select-panel',
    '.mat-mdc-select-panel',
    '.mat-autocomplete-panel',
    'md-select-menu',
    '.md-select-menu-container',
    '.p-dropdown-panel',
    '.p-multiselect-panel',
    '.p-select-overlay',
    '.v-overlay',
    '.k-animation-container',
    '.k-list-container',
    '.k-popup',
    '.RadComboBoxDropDown',
    '.rcbSlide',
    '.dx-dropdowneditor-overlay',
    '.dx-overlay-wrapper',
    '.dxeDropDownWindow',
    '.dxpc-content',
    '.MuiPopover-root',
    '.tt-menu'
  ].join(',');

  /* Separa o caminho do iframe do caminho do elemento dentro dele. */
  const SEPARADOR_FRAME = ' >>> ';

  dom.SEPARADOR_FRAME = SEPARADOR_FRAME;
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

  /*
   * O app monta as janelas em iframes de mesma origem (padrão MDI do ASP.NET),
   * então a busca precisa entrar neles. Frames de outra origem são inacessíveis
   * e simplesmente ignorados.
   */
  dom.documentoDoFrame = function (iframe) {
    try {
      const doc = iframe.contentDocument;
      return doc && doc.body ? doc : null;
    } catch (erro) {
      return null;
    }
  };

  dom.documentos = function () {
    const docs = [document];
    const visitar = function (doc, nivel) {
      if (nivel > 3) return;
      const frames = doc.querySelectorAll('iframe, frame');
      for (let i = 0; i < frames.length; i += 1) {
        const interno = dom.documentoDoFrame(frames[i]);
        if (interno && docs.indexOf(interno) < 0) {
          docs.push(interno);
          visitar(interno, nivel + 1);
        }
      }
    };
    visitar(document, 1);
    return docs;
  };

  /* Todos os elementos de um escopo, atravessando shadow roots e iframes. */
  dom.elementos = function (raiz) {
    const encontrados = [];
    const visitar = function (no, nivel) {
      const lista = no.querySelectorAll('*');
      for (let i = 0; i < lista.length; i += 1) {
        const el = lista[i];
        if (el.closest && el.closest('[data-nv-ui]')) continue;
        encontrados.push(el);
        if (el.shadowRoot) visitar(el.shadowRoot, nivel);
        if (nivel < 3 && (el.tagName === 'IFRAME' || el.tagName === 'FRAME')) {
          const interno = dom.documentoDoFrame(el);
          if (interno) visitar(interno, nivel + 1);
        }
      }
    };
    visitar(raiz || document, 1);
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

  /* Coordenadas na janela do topo, somando o deslocamento dos iframes. */
  dom.retanguloAbsoluto = function (el) {
    const r = el.getBoundingClientRect();
    let x = r.left;
    let y = r.top;
    let doc = el.ownerDocument;
    for (let n = 0; n < 3 && doc && doc !== document; n += 1) {
      const janela = doc.defaultView;
      const iframe = janela && janela.frameElement;
      if (!iframe) break;
      const rf = iframe.getBoundingClientRect();
      x += rf.left;
      y += rf.top;
      doc = iframe.ownerDocument;
    }
    return { left: x, top: y, width: r.width, height: r.height };
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

  /*
   * Setter nativo do value: frameworks reativos ignoram atribuição direta.
   * Resolvido por tagName e pela janela do próprio elemento, porque um elemento
   * dentro de iframe pertence a outro realm (instanceof do topo não funciona).
   */
  dom.setterDeValor = function (el) {
    const janela = el.ownerDocument.defaultView || window;
    const construtor = el.tagName === 'TEXTAREA' ? janela.HTMLTextAreaElement
      : el.tagName === 'SELECT' ? janela.HTMLSelectElement
        : janela.HTMLInputElement;
    if (!construtor) return null;
    const descritor = Object.getOwnPropertyDescriptor(construtor.prototype, 'value');
    return descritor && descritor.set ? descritor.set : null;
  };

  dom.definirValor = function (el, valor) {
    const setter = dom.setterDeValor(el);
    if (setter) setter.call(el, valor);
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
      const setter = dom.setterDeValor(el);
      const atual = el.value + ch;
      if (setter) setter.call(el, atual);
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

  /*
   * Eventos de dentro de um iframe não sobem para o documento do topo, então
   * atalhos e captura de clique precisam ser registrados em cada documento.
   * Frames aparecem depois da carga, por isso o re-registro periódico.
   */
  dom.ouvirTodos = function (tipo, handler, opcoes) {
    const registrados = new WeakSet();
    const registrar = function () {
      dom.documentos().forEach(function (doc) {
        if (registrados.has(doc)) return;
        registrados.add(doc);
        doc.addEventListener(tipo, handler, opcoes);
      });
    };
    registrar();
    const temporizador = setInterval(registrar, 4000);
    /* Em ambiente Node (testes) o timer não deve impedir o processo de encerrar. */
    if (temporizador && typeof temporizador.unref === 'function') temporizador.unref();
    return function desligar() {
      clearInterval(temporizador);
      dom.documentos().forEach(function (doc) {
        try {
          doc.removeEventListener(tipo, handler, opcoes);
        } catch (erro) {
          /* documento já descartado */
        }
      });
    };
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
    const prefixo = dom.caminhoDoFrame(el.ownerDocument);
    const local = dom.caminhoCssNoDocumento(el);
    return prefixo ? prefixo + SEPARADOR_FRAME + local : local;
  };

  /*
   * Elemento dentro de iframe: guarda "caminho do iframe >>> caminho do elemento",
   * para o seletor calibrado continuar resolvendo na próxima sessão.
   */
  dom.caminhoDoFrame = function (doc) {
    if (!doc || doc === document) return null;
    const partes = [];
    let atual = doc;
    for (let n = 0; n < 3 && atual && atual !== document; n += 1) {
      const janela = atual.defaultView;
      const iframe = janela && janela.frameElement;
      if (!iframe) return null;
      partes.unshift(dom.caminhoCssNoDocumento(iframe));
      atual = iframe.ownerDocument;
    }
    return partes.length ? partes.join(SEPARADOR_FRAME) : null;
  };

  /* CSS.escape não existe em navegadores antigos nem em todos os ambientes de teste. */
  function escapar(valor) {
    const texto = String(valor);
    if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') return CSS.escape(texto);
    return texto.replace(/([^\w-])/g, '\\$1');
  }

  dom.caminhoCssNoDocumento = function (el) {
    if (!el || el.nodeType !== 1) return null;
    const partes = [];
    let atual = el;
    while (atual && atual.nodeType === 1 && partes.length < 8) {
      if (atual.id && !/\d{4,}/.test(atual.id)) {
        partes.unshift('#' + escapar(atual.id));
        break;
      }
      const estaveis = ['data-testid', 'data-test', 'data-id', 'name', 'aria-label'];
      let seletor = atual.tagName.toLowerCase();
      let usouAttr = false;
      for (let i = 0; i < estaveis.length; i += 1) {
        const valor = atual.getAttribute(estaveis[i]);
        if (valor && valor.length < 60) {
          seletor += '[' + estaveis[i] + '="' + escapar(valor) + '"]';
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
        if (classes.length) seletor += '.' + classes.map(function (c) { return escapar(c); }).join('.');
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
      const trechos = String(caminho).split(SEPARADOR_FRAME);
      let escopo = raiz || document;
      for (let i = 0; i < trechos.length - 1; i += 1) {
        const iframe = escopo.querySelector(trechos[i].trim());
        const interno = iframe ? dom.documentoDoFrame(iframe) : null;
        if (!interno) return null;
        escopo = interno;
      }
      const el = escopo.querySelector(trechos[trechos.length - 1].trim());
      return el && dom.visivel(el) ? el : null;
    } catch (erro) {
      return null;
    }
  };

  NV.dom = dom;
})((globalThis.NV = globalThis.NV || {}));
