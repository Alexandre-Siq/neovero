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
