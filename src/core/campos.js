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
