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

  /*
   * Resumo em texto do levantamento, pensado para ser colado numa conversa.
   * Mais útil que o JSON completo na primeira rodada de ajustes.
   */
  diagnostico.resumoTexto = function (relatorio) {
    const r = relatorio || {};
    const linhas = [];
    linhas.push('=== Neovero+ · Conferir tela ===');
    linhas.push('Versão: ' + (r.versao || '?') + ' · ' + (r.gerado || ''));
    linhas.push('URL: ' + (r.url || ''));
    linhas.push('Documentos na página (1 = sem iframe): ' + (r.documentos != null ? r.documentos : '?'));
    linhas.push('OS em foco: ' + (r.numeroOs || 'não identificada') + ' · abertura: ' + (r.aberturaOs || 'não lida'));
    linhas.push('Modal abriu: ' + (r.modalAberto ? 'sim' : 'não') + (r.modalAberto ? ' · fechou: ' + (r.modalFechado ? 'sim' : 'não') : ''));
    linhas.push('');

    linhas.push('-- Elementos --');
    (r.elementos || []).forEach(function (item) {
      const marca = item.encontrado ? 'OK   ' : item.opcional ? 'FALTA(opcional)' : 'FALTA';
      linhas.push(
        marca + ' | ' + item.rotulo +
          (item.encontrado ? ' | ' + item.descricao + (item.emFrame ? ' | dentro de iframe' : '') : '') +
          (item.calibrado ? ' | seletor calibrado' : '')
      );
      if (item.encontrado && item.seletor) linhas.push('        seletor: ' + item.seletor);
    });
    linhas.push('');

    linhas.push('-- Opções dos combos --');
    ['ocorrencia', 'servico', 'causa'].forEach(function (chave) {
      const lista = (r.opcoes || {})[chave];
      if (lista == null) {
        linhas.push(chave + ': (não lida)');
        return;
      }
      linhas.push(chave + ' (' + lista.length + '):');
      lista.forEach(function (opcao) {
        linhas.push('  - ' + opcao);
      });
    });
    linhas.push('');

    if ((r.conferenciaDoPreset || []).length) {
      linhas.push('-- Preset “' + ((r.preset && r.preset.nome) || '?') + '” contra a produção --');
      r.conferenciaDoPreset.forEach(function (c) {
        linhas.push(
          c.situacao.toUpperCase() + ' | ' + c.campo + ': “' + c.valor + '”' + (c.sugestao ? ' → sugestão: “' + c.sugestao + '”' : '')
        );
      });
      linhas.push('');
    }

    if ((r.problemas || []).length) {
      linhas.push('-- Problemas --');
      r.problemas.forEach(function (p) {
        linhas.push('* ' + p);
      });
    } else {
      linhas.push('-- Nenhum problema encontrado --');
    }

    return linhas.join('\n');
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
