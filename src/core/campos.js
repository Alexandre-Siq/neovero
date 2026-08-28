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
   * Abre a lista de um combo customizado e devolve o painel flutuante.
   * `reavaliar` recalcula o painel depois de digitar, para combos com filtro.
   */
  campos.abrirPainel = async function (el, options) {
    const opts = options || {};
    const rotulo = opts.rotulo || 'combo';
    const tempos = NV.config.obter().tempos;
    const antes = dom.snapshot();
    const gatilho = dom.alvoClicavel(el, 2) || el;
    dom.clicar(gatilho);

    const esperar = function (sufixo) {
      return async.waitFor(function () {
        return painelAberto(antes, el);
      }, {
        timeout: tempos.elemento,
        intervalo: tempos.intervalo,
        rotulo: 'lista de opções de ' + rotulo + (sufixo || '')
      });
    };

    let painel;
    try {
      painel = await esperar();
    } catch (erro) {
      /* Alguns combos só abrem a lista depois de digitar. */
      if (el.tagName === 'INPUT' && opts.filtro) {
        await dom.digitar(el, String(opts.filtro).slice(0, 12));
        painel = await esperar(' (após digitar)');
      } else {
        throw erro;
      }
    }

    return {
      painel: painel,
      reavaliar: function () {
        return painelAberto(antes, el) || painel;
      }
    };
  };

  /*
   * Fecha a lista de opções sem selecionar nada, tentando o que um usuário faria:
   * Esc, clicar de novo no combo (alterna) e, por último, clicar fora.
   * Não removemos o elemento na mão para não deixar o widget em estado inconsistente.
   */
  campos.garantirPainelFechado = async function (el, painel) {
    const aberto = function () {
      return painel && painel.isConnected && dom.visivel(painel);
    };

    campos.fecharPainel(el);
    await async.sleep(120);
    if (!aberto()) return true;

    try {
      dom.clicar(dom.alvoClicavel(el, 2) || el);
    } catch (erro) {
      /* segue para o clique fora */
    }
    await async.sleep(150);
    if (!aberto()) return true;

    const doc = el.ownerDocument;
    dom.disparar(doc.body, 'mousedown');
    dom.disparar(doc.body, 'click');
    await async.sleep(150);
    if (!aberto()) return true;

    NV.log.aviso('A lista de opções continuou aberta na tela', { painel: dom.descrever(painel) });
    return false;
  };

  /* Lista as opções disponíveis sem selecionar nada (usado no "Conferir tela"). */
  campos.listarOpcoes = async function (el, options) {
    const opts = options || {};
    const responder = function (opcoes, painelFechado) {
      return opts.comEstado ? { opcoes: opcoes, painelFechado: painelFechado } : opcoes;
    };

    if (!el) return responder(null, true);

    if (el.tagName === 'SELECT') {
      const nativas = Array.prototype.slice
        .call(el.options)
        .map(function (o) {
          return o.textContent.trim();
        })
        .filter(Boolean);
      return responder(nativas, true);
    }

    const aberto = await campos.abrirPainel(el, { rotulo: opts.rotulo });
    const opcoes = opcoesDe(aberto.painel).map(function (o) {
      return o.texto;
    });
    const fechou = await campos.garantirPainelFechado(el, aberto.painel);
    return responder(opcoes, fechou);
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
    const aberto = await campos.abrirPainel(el, { rotulo: rotulo, filtro: valor });
    let painel = aberto.painel;

    let melhor = text.pickBest(opcoesDe(painel), valor, { getText: (o) => o.texto, min: 0.8 });

    if (!melhor && el.tagName === 'INPUT') {
      await dom.digitar(el, String(valor).slice(0, 12));
      await async.sleep(250);
      const painel2 = aberto.reavaliar();
      melhor = text.pickBest(opcoesDe(painel2), valor, { getText: (o) => o.texto, min: 0.8 });
      if (melhor) painel = painel2;
    }

    if (!melhor) {
      const disponiveis = opcoesDe(painel).map((o) => o.texto).slice(0, 40);
      await campos.garantirPainelFechado(el, painel);
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
