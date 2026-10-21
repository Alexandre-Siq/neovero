/*
 * Réplica de demonstração da tela do Neovero (Monitor de Atendimento + Ordem de Serviço).
 * Mesma estrutura usada nos testes automatizados: combos customizados com lista flutuante,
 * campos de data em texto livre, rótulos com asterisco, botão "Fechar OS" só com ícone e
 * tooltip, e diálogo de confirmação do sistema.
 *
 * Serve para exercitar e testar o Neovero+ sem acesso ao sistema real.
 * Expõe window.AppFalso = { montar, emIframe, css }.
 */
(function () {
  'use strict';

  const OPCOES_OCORRENCIA = ['SUPORTE - TI', 'MANUTENÇÃO PREDIAL', 'HIGIENIZAÇÃO'];
  const OPCOES_SERVICO_CURTA = ['CONFIGURAÇÃO DE EQUIPAMENTOS', 'CONFIGURAÇÃO DE SOFTWARE', 'TROCA DE PEÇA'];

  /* Usa a lista real da produção quando o script está carregado, para a réplica
     ficar fiel (é ela que faz a classificação por descrição valer a pena testar). */
  function opcoesDeServicoPadrao() {
    /* No navegador NV vive em window; nos testes em jsdom, no globalThis. */
    const escopo = (typeof window !== 'undefined' && window.NV) || globalThis.NV || null;
    const doScript = escopo && escopo.classificar && escopo.classificar.SERVICOS_CONHECIDOS;
    return doScript && doScript.length ? doScript : OPCOES_SERVICO_CURTA;
  }
  const LISTA_PADRAO = [
    ['202602693', 'ALOJAMENTO CONJUNTO - 4º ANDAR (48380)'],
    ['202602691', '5º ANDAR - ÁREAS COMUNS (8030)'],
    ['202602690', 'ALOJAMENTO CONJUNTO - 4º ANDAR (48380)'],
    ['202602688', '7º ANDAR - ÁREAS COMUNS (8032)']
  ];

  const CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0d1117; color: #d7dbe0;
    font: 13px/1.45 system-ui, "Segoe UI", Roboto, sans-serif;
  }
  .topo { display: flex; align-items: center; gap: 18px; background: #12161c; padding: 8px 14px; border-bottom: 1px solid #222831; }
  .logo { font-weight: 800; color: #10b981; letter-spacing: .5px; }
  .topo nav a { color: #9aa4b2; text-decoration: none; font-size: 12px; }
  .area { display: flex; gap: 14px; padding: 14px; align-items: flex-start; }

  .janela { background: #171c23; border: 1px solid #242b34; border-radius: 8px; overflow: hidden; }
  .janela > .barra-titulo {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    background: #1d232b; border-bottom: 1px solid #242b34; font-weight: 600; font-size: 12px;
  }
  .janela > .barra-titulo .icone-fechar {
    margin-left: auto; background: #232a33; border: 1px solid #2f3742; color: #a8b3c1;
    border-radius: 6px; width: 26px; height: 24px; cursor: pointer;
  }
  .janela > .barra-titulo .icone-fechar:hover { background: #2c3540; color: #fff; }

  .monitor { width: 300px; flex: none; }
  .linha-os { display: flex; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #1e242c; cursor: pointer; }
  .linha-os:hover { background: #1c222a; }
  .linha-os .numero { color: #60a5fa; min-width: 78px; }
  .linha-os .local { color: #8b95a3; font-size: 11px; }

  .janela-os { flex: 1; max-width: 640px; }
  .barra-os { display: flex; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #242b34; }
  .barra-os button { background: #1f252d; color: #cfd6de; border: 1px solid #2c3440; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
  .status-os { display: block; padding: 8px 12px; color: #9aa4b2; font-size: 12px; }
  .dados-os { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 4px 12px 12px; }
  .celula { display: grid; gap: 2px; }
  .celula span:first-child { color: #8b95a3; font-size: 11px; }
  .secao, .requisicao { margin: 0 12px 12px; background: #1b222a; border: 1px solid #242b34; border-radius: 8px; padding: 10px; }
  .titulo-secao, .requisicao > div:first-child { color: #34d399; font-weight: 600; margin-bottom: 6px; }
  .item-ocorrencia { border-top: 1px solid #242b34; padding-top: 8px; margin-top: 8px; }
  .item-ocorrencia span { color: #8b95a3; font-size: 11px; }

  .adicionar { margin: 0 12px 14px; background: #1b222a; border: 1px solid #242b34; border-radius: 8px; padding: 10px; }
  .titulo-adicionar { text-align: center; color: #8b95a3; font-size: 11px; margin-bottom: 8px; }
  .botoes-adicionar { display: flex; gap: 14px; justify-content: center; }
  .botao-adicionar { display: grid; justify-items: center; gap: 5px; cursor: pointer; width: 62px; }
  .botao-adicionar .icone {
    width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
    background: #ef4444; color: #fff; font-size: 15px;
  }
  .botoes-adicionar .botao-adicionar:nth-child(2) .icone { background: #3b82f6; }
  .botoes-adicionar .botao-adicionar:nth-child(3) .icone { background: #a855f7; }
  .botao-adicionar span { font-size: 11px; color: #b6bec9; }

  .modal-ocorrencia {
    position: fixed; left: 50%; top: 6%; transform: translateX(-50%);
    width: 520px; background: #171c23; border: 1px solid #2c3440; border-radius: 10px;
    box-shadow: 0 24px 70px rgba(0,0,0,.6); padding: 14px; z-index: 50;
  }
  .titulo-modal { font-size: 15px; margin-bottom: 12px; color: #e6eaee; }
  .campo { display: grid; gap: 4px; margin-bottom: 10px; }
  .campo.horizontal { display: flex; align-items: center; gap: 8px; }
  .rotulo { color: #8b95a3; font-size: 11px; }
  .combo, input[type=text], select, textarea {
    background: #0f1319; border: 1px solid #2c3440; border-radius: 6px;
    padding: 7px 9px; color: #dfe4ea; font: inherit; width: 100%;
  }
  .combo { cursor: pointer; user-select: none; }
  .painel-opcoes {
    position: fixed; z-index: 80; list-style: none; margin: 0; padding: 4px;
    background: #10151b; border: 1px solid #2f3742; border-radius: 8px; min-width: 320px;
    box-shadow: 0 16px 40px rgba(0,0,0,.6); max-height: 240px; overflow: auto;
  }
  .painel-opcoes li { padding: 7px 9px; border-radius: 6px; cursor: pointer; }
  .painel-opcoes.virtual { max-height: 288px; }
  .painel-opcoes li:hover { background: #1d5b48; }
  .rodape-modal { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .rodape-modal button { border: 0; border-radius: 6px; padding: 8px 16px; cursor: pointer; }
  .rodape-modal button:last-child { background: #10b981; color: #06281f; font-weight: 700; }
  .rodape-modal button:first-child { background: #232a33; color: #cfd6de; }
  .erro-modal { color: #fca5a5; font-size: 12px; margin-top: 8px; }
  .dialogo-confirmacao {
    position: fixed; left: 50%; top: 40%; transform: translate(-50%,-50%); z-index: 90;
    background: #171c23; border: 1px solid #2c3440; border-radius: 10px; padding: 18px;
    box-shadow: 0 24px 70px rgba(0,0,0,.6); display: grid; gap: 12px; justify-items: center;
  }
  .dialogo-confirmacao button { border: 0; border-radius: 6px; padding: 7px 18px; cursor: pointer; margin: 0 4px; }
  .dialogo-confirmacao button:last-child { background: #10b981; color: #06281f; font-weight: 700; }
  iframe.moldura-os { width: 100%; height: 640px; border: 0; }
  `;

  function h(doc, tag, props, filhos) {
    const el = doc.createElement(tag);
    Object.keys(props || {}).forEach(function (chave) {
      if (chave === 'texto') el.textContent = props[chave];
      else if (chave === 'classe') el.className = props[chave];
      else el.setAttribute(chave, props[chave]);
    });
    (filhos || []).forEach(function (filho) {
      if (filho) el.appendChild(filho);
    });
    return el;
  }

  function injetarCss(doc) {
    if (doc.querySelector('style[data-app-falso]')) return;
    const estilo = doc.createElement('style');
    estilo.setAttribute('data-app-falso', '1');
    estilo.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(estilo);
  }

  /* Remove só o conteúdo da réplica: o painel do Neovero+ e o relatório do autoteste ficam. */
  function limparApp(doc) {
    Array.prototype.slice.call(doc.body.children).forEach(function (el) {
      if (!el.hasAttribute || !el.hasAttribute('data-nv-ui')) el.remove();
    });
  }

  /*
   * Combo customizado: alterna no clique e fecha ao clicar fora, como os widgets reais.
   * De propósito NÃO fecha com Esc — assim o script é obrigado a exercitar as outras
   * formas de fechar, que é o pior caso que pode aparecer na produção.
   */
  /*
   * Lista rolável que renderiza apenas a janela visível, como o combo de Serviço do
   * Neovero (DevExpress). Em jsdom não existe layout, então o container declara
   * scrollTop/scrollHeight/clientHeight por conta própria — é o que permite testar
   * a leitura completa da lista.
   */
  function listaVirtual(doc, opcoes, aoEscolher) {
    const ALTURA_ITEM = 24;
    const VISIVEIS = 12;
    const lista = h(doc, 'ul', { role: 'listbox', classe: 'painel-opcoes virtual' });
    let topo = 0;

    function render() {
      lista.innerHTML = '';
      const inicio = Math.max(0, Math.floor(topo / ALTURA_ITEM));
      opcoes.slice(inicio, inicio + VISIVEIS).forEach(function (opcao) {
        const item = h(doc, 'li', { role: 'option', texto: opcao });
        item.addEventListener('click', function () {
          aoEscolher(opcao);
        });
        lista.appendChild(item);
      });
    }

    Object.defineProperty(lista, 'scrollHeight', { get: () => opcoes.length * ALTURA_ITEM });
    Object.defineProperty(lista, 'clientHeight', { get: () => VISIVEIS * ALTURA_ITEM });
    Object.defineProperty(lista, 'scrollTop', {
      get: () => topo,
      set: function (valor) {
        const maximo = Math.max(0, opcoes.length * ALTURA_ITEM - VISIVEIS * ALTURA_ITEM);
        topo = Math.max(0, Math.min(maximo, Number(valor) || 0));
        render();
      }
    });

    render();
    return lista;
  }

  function combo(doc, nome, opcoes, options) {
    const gatilho = h(doc, 'div', {
      role: 'combobox',
      tabindex: '0',
      'data-combo': nome,
      classe: 'combo',
      texto: 'Selecione ...'
    });

    let lista = null;

    function fechar() {
      if (!lista) return;
      lista.remove();
      lista = null;
      doc.removeEventListener('mousedown', aoClicarFora, true);
    }

    function aoClicarFora(ev) {
      if (!lista) return;
      if (gatilho === ev.target || gatilho.contains(ev.target) || lista.contains(ev.target)) return;
      fechar();
    }

    gatilho.addEventListener('click', function () {
      if (lista) {
        fechar();
        return;
      }
      const escolher = function (opcao) {
        gatilho.textContent = opcao;
        fechar();
      };
      if (options && options.virtual) {
        lista = listaVirtual(doc, opcoes, escolher);
        lista.setAttribute('data-lista', nome);
      } else {
        lista = h(doc, 'ul', { role: 'listbox', 'data-lista': nome, classe: 'painel-opcoes' });
        opcoes.forEach(function (opcao) {
          const item = h(doc, 'li', { role: 'option', texto: opcao });
          item.addEventListener('click', function () {
            escolher(opcao);
          });
          lista.appendChild(item);
        });
      }
      doc.body.appendChild(lista);
      const r = gatilho.getBoundingClientRect();
      lista.style.left = r.left + 'px';
      lista.style.top = r.bottom + 4 + 'px';
      lista.style.minWidth = r.width + 'px';
      doc.addEventListener('mousedown', aoClicarFora, true);
    });

    return gatilho;
  }

  function campo(doc, rotuloTexto, controle, attrs) {
    const rotulo = h(doc, 'label', Object.assign({ texto: rotuloTexto, classe: 'rotulo' }, attrs || {}));
    return h(doc, 'div', { classe: 'campo' }, [rotulo, controle]);
  }

  /* Modal "Nova Ocorrência": só fecha quando os obrigatórios estão preenchidos. */
  function abrirModal(doc, estado) {
    const comboOcorrencia = combo(doc, 'ocorrencia', OPCOES_OCORRENCIA);
    const comboServico = combo(doc, 'servico', estado.opcoesServico || opcoesDeServicoPadrao(), {
      virtual: !!estado.servicoVirtual
    });
    const dataOcorrencia = h(doc, 'input', { type: 'text', 'data-campo': 'dataOcorrencia' });
    const dataFinal = h(doc, 'input', { type: 'text', 'data-campo': 'dataFinal' });
    const radioInterno = h(doc, 'input', { type: 'radio', id: 'interno', name: 'local', checked: 'checked' });
    const radioExterno = h(doc, 'input', { type: 'radio', id: 'externo', name: 'local' });
    const selectCausa = h(doc, 'select', { 'data-campo': 'causa' }, [
      h(doc, 'option', { value: '', texto: 'Selecione ...' }),
      h(doc, 'option', { value: '1', texto: 'FALHA DE HARDWARE' }),
      h(doc, 'option', { value: '2', texto: 'ERRO DE CONFIGURAÇÃO' })
    ]);
    const observacao = h(doc, 'textarea', { 'data-campo': 'observacao' });
    const continuar = h(doc, 'input', { type: 'checkbox', id: 'continuar' });
    const erro = h(doc, 'div', { classe: 'erro-modal', role: 'alert' });
    erro.style.display = 'none';
    const botaoSalvar = h(doc, 'button', { texto: 'Salvar' });
    const botaoCancelar = h(doc, 'button', { texto: 'Cancelar' });

    const modal = h(doc, 'div', { role: 'dialog', classe: 'modal-ocorrencia' }, [
      h(doc, 'div', { classe: 'titulo-modal', texto: 'Nova Ocorrência' }),
      campo(doc, 'Ocorrência *', comboOcorrencia),
      campo(doc, 'Data da Ocorrência *', dataOcorrencia),
      campo(doc, 'Data Final do Serviço', dataFinal),
      h(doc, 'div', { classe: 'campo horizontal' }, [
        h(doc, 'label', { for: 'interno', texto: 'Interno' }),
        radioInterno,
        h(doc, 'label', { for: 'externo', texto: 'Externo' }),
        radioExterno
      ]),
      campo(doc, 'Causa', selectCausa),
      campo(doc, 'Serviço *', comboServico),
      campo(doc, 'Observação', observacao),
      h(doc, 'div', { classe: 'campo horizontal' }, [
        h(doc, 'label', { for: 'continuar', texto: 'Continuar Incluindo' }),
        continuar
      ]),
      erro,
      h(doc, 'div', { classe: 'rodape-modal' }, [botaoCancelar, botaoSalvar])
    ]);

    botaoCancelar.addEventListener('click', function () {
      modal.remove();
    });

    botaoSalvar.addEventListener('click', function () {
      const faltando = [];
      if (comboOcorrencia.textContent === 'Selecione ...') faltando.push('Ocorrência');
      if (comboServico.textContent === 'Selecione ...') faltando.push('Serviço');
      if (!dataOcorrencia.value) faltando.push('Data da Ocorrência');
      if (faltando.length) {
        erro.style.display = '';
        erro.textContent = 'Erro: preencha os campos obrigatórios: ' + faltando.join(', ');
        return;
      }
      estado.ocorrencias.push({
        ocorrencia: comboOcorrencia.textContent,
        servico: comboServico.textContent,
        inicio: dataOcorrencia.value,
        fim: dataFinal.value,
        causa: selectCausa.options[selectCausa.selectedIndex].textContent,
        interno: radioInterno.checked,
        observacao: observacao.value
      });
      if (!continuar.checked) modal.remove();
      estado.render();
    });

    doc.body.appendChild(modal);
    return modal;
  }

  /*
   * Monta a tela. Opções:
   *   documento, numero, listaOs, abertura, opcoesServico,
   *   semTooltipFecharOs, comAtendimentoIniciado, semMonitor
   */
  function montar(opcoes) {
    const opts = opcoes || {};
    const doc = opts.documento || document;
    injetarCss(doc);
    limparApp(doc);

    const lista = opts.listaOs || LISTA_PADRAO;
    const primeiro = Array.isArray(lista[0]) ? lista[0][0] : lista[0];
    const estado = {
      numero: opts.numero || primeiro,
      ocorrencias: [],
      fechada: false,
      atendimentoIniciado: false,
      opcoesServico: opts.opcoesServico,
      servicoVirtual: !!opts.servicoVirtual,
      descricao: opts.descricao || 'computador da enfermagem nao esta ligando'
    };

    const areaOs = h(doc, 'div', { classe: 'janela janela-os', id: 'janela-os' });

    estado.render = function () {
      areaOs.innerHTML = '';

      const botaoFechar = h(
        doc,
        'button',
        Object.assign({ classe: 'icone-fechar', texto: '✓' }, opts.semTooltipFecharOs ? {} : { title: 'Fechar OS' })
      );
      botaoFechar.addEventListener('click', function () {
        if (doc.querySelector('.dialogo-confirmacao')) return;
        const dialogo = h(doc, 'div', { role: 'dialog', classe: 'dialogo-confirmacao' }, [
          h(doc, 'div', { texto: 'Confirma o encerramento desta Ordem de Serviço?' })
        ]);
        const sim = h(doc, 'button', { texto: 'Sim' });
        const nao = h(doc, 'button', { texto: 'Não' });
        sim.addEventListener('click', function () {
          dialogo.remove();
          estado.fechada = true;
          estado.render();
        });
        nao.addEventListener('click', function () {
          dialogo.remove();
        });
        dialogo.appendChild(h(doc, 'div', {}, [nao, sim]));
        doc.body.appendChild(dialogo);
      });

      const botaoIniciar = h(doc, 'button', { texto: 'Iniciar Atendimento' });
      if (estado.atendimentoIniciado || opts.comAtendimentoIniciado) botaoIniciar.style.display = 'none';
      botaoIniciar.addEventListener('click', function () {
        estado.atendimentoIniciado = true;
        estado.render();
      });

      const botaoOcorrencia = h(doc, 'div', { classe: 'botao-adicionar' }, [
        h(doc, 'div', { classe: 'icone', texto: '☺' }),
        h(doc, 'span', { texto: 'Ocorrência' })
      ]);
      botaoOcorrencia.addEventListener('click', function () {
        abrirModal(doc, estado);
      });

      const listaOcorrencias = h(doc, 'div', { classe: 'lista-ocorrencias' });
      estado.ocorrencias.forEach(function (o) {
        listaOcorrencias.appendChild(
          h(doc, 'div', { classe: 'item-ocorrencia' }, [
            h(doc, 'span', { texto: o.inicio + ' solucionada em ' + o.fim }),
            h(doc, 'div', { texto: o.ocorrencia }),
            h(doc, 'div', { texto: o.servico })
          ])
        );
      });

      areaOs.appendChild(
        h(doc, 'div', { classe: 'barra-titulo' }, [
          h(doc, 'span', { classe: 'titulo-os', texto: 'ORDEM DE SERVIÇO ' + estado.numero }),
          botaoFechar
        ])
      );
      areaOs.appendChild(
        h(doc, 'div', { classe: 'barra-os' }, [
          h(doc, 'button', { texto: 'Salvar' }),
          h(doc, 'button', { texto: 'Cancelar' }),
          botaoIniciar
        ])
      );
      areaOs.appendChild(
        h(doc, 'span', {
          classe: 'status-os',
          texto: estado.fechada
            ? 'OS Encerrada por KAUE HENRIQUE DOS SANTOS DIAS'
            : 'Aberta por KAUE HENRIQUE DOS SANTOS DIAS'
        })
      );
      areaOs.appendChild(
        h(doc, 'div', { classe: 'dados-os' }, [
          h(doc, 'div', { classe: 'celula' }, [
            h(doc, 'span', { texto: 'Requisição' }),
            h(doc, 'span', { texto: '14/08/2026 09:51' })
          ]),
          h(doc, 'div', { classe: 'celula' }, [
            h(doc, 'span', { texto: 'Abertura' }),
            h(doc, 'span', { texto: opts.abertura || '14/08/2026 09:51' })
          ]),
          h(doc, 'div', { classe: 'celula' }, [
            h(doc, 'span', { texto: 'Atendimento' }),
            h(doc, 'span', { texto: 'Aguardando há 14 dias' })
          ])
        ])
      );
      areaOs.appendChild(
        h(doc, 'div', { classe: 'requisicao' }, [
          h(doc, 'div', { texto: 'Requisição de Serviço' }),
          h(doc, 'div', { classe: 'celula' }, [
            h(doc, 'span', { texto: 'Número' }),
            h(doc, 'span', { texto: '62220' })
          ]),
          h(doc, 'div', { classe: 'celula' }, [
            h(doc, 'span', { texto: 'Requisitante' }),
            h(doc, 'span', { texto: 'IGNACIO GUEDES RIBEIRO' })
          ]),
          h(doc, 'div', { classe: 'celula' }, [
            h(doc, 'span', { texto: 'Requisição' }),
            h(doc, 'span', { classe: 'descricao-requisicao', texto: estado.descricao })
          ])
        ])
      );
      areaOs.appendChild(
        h(doc, 'div', { classe: 'secao' }, [
          h(doc, 'div', { classe: 'titulo-secao', texto: 'Ocorrências' }),
          listaOcorrencias
        ])
      );
      areaOs.appendChild(
        h(doc, 'div', { classe: 'adicionar' }, [
          h(doc, 'div', { classe: 'titulo-adicionar', texto: 'Adicionar' }),
          h(doc, 'div', { classe: 'botoes-adicionar' }, [
            botaoOcorrencia,
            h(doc, 'div', { classe: 'botao-adicionar' }, [
              h(doc, 'div', { classe: 'icone', texto: '⚙' }),
              h(doc, 'span', { texto: 'Serviço' })
            ]),
            h(doc, 'div', { classe: 'botao-adicionar' }, [
              h(doc, 'div', { classe: 'icone', texto: '▣' }),
              h(doc, 'span', { texto: 'Produto' })
            ])
          ])
        ])
      );
    };

    const topo = h(doc, 'div', { classe: 'topo' }, [
      h(doc, 'span', { classe: 'logo', texto: 'neovero' }),
      h(doc, 'nav', {}, [
        h(doc, 'a', { href: '#', texto: 'Equipamentos' }),
        h(doc, 'a', { href: '#', texto: 'Ordens de Serviço' })
      ])
    ]);

    const monitor = h(doc, 'div', { classe: 'janela monitor' }, [
      h(doc, 'div', { classe: 'barra-titulo' }, [h(doc, 'span', { texto: 'Monitor de Atendimento' })])
    ]);
    lista.forEach(function (item) {
      const numero = Array.isArray(item) ? item[0] : item;
      const local = Array.isArray(item) ? item[1] : '';
      const linha = h(doc, 'div', { classe: 'linha-os', tabindex: '0' }, [
        h(doc, 'span', { classe: 'numero', texto: numero }),
        h(doc, 'span', { classe: 'local', texto: local })
      ]);
      linha.addEventListener('click', function () {
        estado.numero = numero;
        estado.ocorrencias = [];
        estado.fechada = false;
        estado.atendimentoIniciado = false;
        estado.render();
      });
      monitor.appendChild(linha);
    });

    const area = h(doc, 'div', { classe: 'area' }, [opts.semMonitor ? null : monitor, areaOs]);
    doc.body.appendChild(topo);
    doc.body.appendChild(area);
    estado.render();

    return { doc: doc, estado: estado, numero: estado.numero };
  }

  /*
   * Monta a tela dentro de um iframe de mesma origem, como nas janelas MDI do ASP.NET.
   * Devolve null quando o navegador bloqueia o acesso ao conteúdo do frame.
   */
  function emIframe(opcoes) {
    const opts = opcoes || {};
    const doc = opts.documentoHospedeiro || document;
    injetarCss(doc);
    limparApp(doc);
    const iframe = doc.createElement('iframe');
    iframe.className = 'moldura-os';
    iframe.setAttribute('name', 'janelaOs');
    doc.body.appendChild(iframe);
    let interno = null;
    try {
      interno = iframe.contentDocument;
      if (!interno || !interno.body) return null;
    } catch (erro) {
      return null;
    }
    const app = montar(Object.assign({}, opts, { documento: interno }));
    app.iframe = iframe;
    return app;
  }

  window.AppFalso = {
    montar: montar,
    emIframe: emIframe,
    css: CSS,
    OPCOES_OCORRENCIA: OPCOES_OCORRENCIA,
    OPCOES_SERVICO: OPCOES_SERVICO_CURTA,
    opcoesDeServicoPadrao: opcoesDeServicoPadrao
  };
})();
