/*
 * Autoteste do Neovero+ no navegador.
 * Roda o fluxo real (cliques, combos, datas, salvar, fechar) contra a réplica da tela
 * e mostra um relatório verde/vermelho. É a forma de conferir que a automação funciona
 * neste navegador antes de usá-la em um chamado de verdade.
 */
(function () {
  'use strict';

  const testes = [];
  let relatorio = null;

  function teste(nome, fn) {
    testes.push({ nome: nome, fn: fn });
  }

  function afirmar(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
  }

  function igual(atual, esperado, contexto) {
    if (atual !== esperado) {
      throw new Error((contexto ? contexto + ': ' : '') + 'esperava “' + esperado + '”, veio “' + atual + '”');
    }
  }

  function esperar(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function NV() {
    return window.NV;
  }

  function configurarPadrao(extra) {
    NV().config.restaurarPadrao();
    NV().config.aplicar(
      Object.assign(
        {
          presetAtivo: 'ti-configuracao',
          tempos: { elemento: 2500, modal: 2500, salvar: 2500, fechar: 2500, intervalo: 40 },
          lote: { esperaEntreOs: 200 },
          cacheServicos: { valores: [], atualizadoEm: null }
        },
        extra || {}
      )
    );
  }

  function modalAberto(doc) {
    const base = doc || document;
    const local = base.querySelector('.modal-ocorrencia');
    if (local) return local;
    const frames = base.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i += 1) {
      try {
        const interno = frames[i].contentDocument;
        const achado = interno && interno.querySelector('.modal-ocorrencia');
        if (achado) return achado;
      } catch (erro) {
        /* frame inacessível */
      }
    }
    return null;
  }

  /* ------------------------------- testes ------------------------------- */

  teste('O painel Neovero+ foi injetado na página', async function () {
    afirmar(window.NV && window.NV.fluxo, 'o script Neovero+ não carregou (window.NV ausente)');
    const host = document.querySelector('[data-nv-ui="painel"]');
    afirmar(host, 'painel não encontrado na página');
    afirmar(host.shadowRoot, 'painel sem shadow root');
    const botao = host.shadowRoot.querySelector('[data-fechar-chamado]');
    afirmar(botao, 'botão "Fechar chamado" não encontrado no painel');
    return 'painel montado com o preset “' + (NV().config.presetAtivo() || {}).nome + '”';
  });

  teste('Simular preenche os quatro campos e não salva nada', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ numero: '202602691' });
    const agora = new Date(2026, 7, 28, 9, 19);

    const resultado = await NV().fluxo.fecharOS({ execucaoSeca: true, agora: agora });
    afirmar(resultado.ok, 'fluxo falhou: ' + resultado.erro + ' (passo: ' + resultado.passo + ')');

    const modal = modalAberto();
    afirmar(modal, 'o modal deveria continuar aberto na simulação');
    igual(modal.querySelector('[data-combo="ocorrencia"]').textContent, 'SUPORTE - TI', 'Ocorrência');
    igual(modal.querySelector('[data-campo="dataOcorrencia"]').value, '28/08/2026, 09:18', 'Data da Ocorrência');
    igual(modal.querySelector('[data-campo="dataFinal"]').value, '28/08/2026, 09:19', 'Data Final do Serviço');
    igual(modal.querySelector('[data-combo="servico"]').textContent, 'CONFIGURAÇÃO DE EQUIPAMENTOS', 'Serviço');
    igual(app.estado.ocorrencias.length, 0, 'nada deveria ter sido salvo');
    igual(app.estado.fechada, false, 'a OS não deveria ter sido fechada');

    modal.remove();
    return 'ocorrência, duas datas e serviço preenchidos; nada salvo';
  });

  teste('Fechamento completo: lança a ocorrência e encerra a OS', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ numero: '202602691' });

    const resultado = await NV().fluxo.fecharOS({ agora: new Date(2026, 7, 28, 9, 19) });
    afirmar(resultado.ok, 'fluxo falhou: ' + resultado.erro + ' (passo: ' + resultado.passo + ')');
    igual(resultado.fechada, true, 'deveria ter fechado a OS');
    igual(resultado.numeroOs, '202602691', 'número da OS');
    igual(app.estado.ocorrencias.length, 1, 'ocorrências lançadas');
    igual(app.estado.ocorrencias[0].ocorrencia, 'SUPORTE - TI', 'ocorrência salva');
    igual(app.estado.ocorrencias[0].servico, 'CONFIGURAÇÃO DE EQUIPAMENTOS', 'serviço salvo');
    igual(app.estado.ocorrencias[0].inicio, '28/08/2026, 09:18', 'início salvo');
    igual(app.estado.ocorrencias[0].interno, true, 'deveria estar marcado como Interno');
    igual(app.estado.fechada, true, 'a OS deveria estar encerrada');

    return 'OS encerrada em ' + (resultado.ms / 1000).toFixed(1) + 's';
  });

  teste('Preset com causa, observação e Externo preenche os campos opcionais', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ numero: '202602691' });
    NV().config.salvarPreset({
      id: 'autoteste-completo',
      nome: 'Autoteste completo',
      ocorrencia: 'SUPORTE - TI',
      servico: 'CONFIGURAÇÃO DE REDE',
      causa: 'ERRO DE CONFIGURAÇÃO',
      local: 'externo',
      observacao: 'Ponto de rede reconfigurado.',
      datas: { modo: 'inicioAgora', duracaoMin: 15 }
    });
    NV().config.definirPresetAtivo('autoteste-completo');

    const resultado = await NV().fluxo.fecharOS({ agora: new Date(2026, 7, 28, 8, 0) });
    afirmar(resultado.ok, 'fluxo falhou: ' + resultado.erro + ' (passo: ' + resultado.passo + ')');

    const o = app.estado.ocorrencias[0];
    igual(o.servico, 'CONFIGURAÇÃO DE REDE', 'serviço');
    igual(o.causa, 'ERRO DE CONFIGURAÇÃO', 'causa');
    igual(o.observacao, 'Ponto de rede reconfigurado.', 'observação');
    igual(o.interno, false, 'deveria ter marcado Externo');
    igual(o.inicio, '28/08/2026, 08:00', 'início');
    igual(o.fim, '28/08/2026, 08:15', 'fim');

    configurarPadrao();
    return 'causa, observação, Externo e janela de 15 min aplicados';
  });

  teste('Serviço inexistente aborta sem salvar e lista as opções disponíveis', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({
      numero: '202602691',
      opcoesServico: ['TROCA DE TONER', 'INSTALAÇÃO DE SOFTWARE']
    });

    const resultado = await NV().fluxo.fecharOS({});
    igual(resultado.ok, false, 'deveria ter falhado');
    afirmar(/Selecionar serviço/.test(resultado.passo || ''), 'passo inesperado: ' + resultado.passo);
    afirmar(/Opção não encontrada/.test(resultado.erro || ''), 'erro inesperado: ' + resultado.erro);
    igual(app.estado.ocorrencias.length, 0, 'não deveria salvar ocorrência incompleta');
    igual(app.estado.fechada, false, 'não deveria fechar a OS');

    const passo = (resultado.passos || []).filter(function (p) {
      return /Selecionar serviço/.test(p.passo);
    })[0];
    afirmar(passo && passo.detalhes && passo.detalhes.disponiveis.length === 2, 'o log deveria listar as opções do combo');

    const modal = modalAberto();
    if (modal) modal.remove();
    return 'abortou no passo certo e registrou as opções: ' + passo.detalhes.disponiveis.join(', ');
  });

  teste('Botão "Fechar OS" sem tooltip: falha e volta a funcionar após calibrar', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ numero: '202602691', semTooltipFecharOs: true });

    const sem = await NV().fluxo.fecharOS({});
    igual(sem.ok, false, 'sem tooltip e sem calibração deveria falhar');
    afirmar(/Fechar OS/.test(sem.erro || ''), 'erro inesperado: ' + sem.erro);
    igual(app.estado.ocorrencias.length, 1, 'a ocorrência é lançada antes de falhar no fechamento');
    igual(app.estado.fechada, false, 'a OS não deveria ter fechado');

    NV().config.definirSeletor('botaoFecharOs', 'button.icone-fechar');
    const app2 = window.AppFalso.montar({ numero: '202602691', semTooltipFecharOs: true });
    const com = await NV().fluxo.fecharOS({});
    afirmar(com.ok, 'com seletor calibrado deveria funcionar: ' + com.erro);
    igual(app2.estado.fechada, true, 'a OS deveria estar encerrada');

    configurarPadrao();
    return 'a calibração manual de seletor resolve botão só com ícone';
  });

  teste('Modo lote fecha várias OS seguidas', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ listaOs: ['202602691', '202602690', '202602688'] });

    const resumo = await NV().lote.fechar({ numeros: ['202602690', '202602688'] });
    igual(resumo.total, 2, 'total do lote');
    igual(
      resumo.sucesso,
      2,
      'sucessos do lote' + (resumo.falhas.length ? ' — falhas: ' + JSON.stringify(resumo.falhas) : '')
    );
    igual(app.estado.fechada, true, 'a última OS deveria estar encerrada');

    return '2 de 2 OS fechadas em sequência';
  });

  teste('“Conferir tela” lista os elementos e as opções sem alterar nada', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ numero: '202602691' });

    const rel = await NV().fluxo.levantamento({});
    igual(rel.numeroOs, '202602691', 'número da OS');
    igual(rel.modalAberto, true, 'o modal deveria abrir');
    igual(rel.modalFechado, true, 'o modal deveria ser fechado no fim');
    igual(app.estado.ocorrencias.length, 0, 'não deveria salvar nada');
    igual(app.estado.atendimentoIniciado, false, 'não deveria iniciar atendimento');
    afirmar(rel.opcoes.ocorrencia && rel.opcoes.ocorrencia.length === 3, 'deveria listar as 3 ocorrências');
    afirmar(rel.opcoes.servico && rel.opcoes.servico.length === 3, 'deveria listar os 3 serviços');
    afirmar(
      rel.conferenciaDoPreset.some(function (c) {
        return c.campo === 'Serviço' && c.situacao === 'exato';
      }),
      'o serviço do preset deveria bater exatamente'
    );
    igual((rel.problemas || []).length, 0, 'não deveria haver problemas nesta réplica');

    return 'listou ' + rel.elementos.length + ' elementos e as opções dos combos';
  });

  teste('Simulação com serviço inexistente reporta o problema sem abortar', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ numero: '202602691', opcoesServico: ['TROCA DE TONER'] });

    const resultado = await NV().fluxo.fecharOS({ execucaoSeca: true, agora: new Date(2026, 7, 28, 9, 19) });
    afirmar(resultado.ok, 'a simulação não deveria abortar: ' + resultado.erro);
    igual(resultado.problemas.length, 1, 'problemas reportados');
    afirmar(/Selecionar serviço/.test(resultado.problemas[0].passo), 'passo inesperado: ' + resultado.problemas[0].passo);

    const modal = modalAberto();
    afirmar(modal, 'modal deveria seguir aberto');
    igual(modal.querySelector('[data-campo="dataFinal"]').value, '28/08/2026, 09:19', 'data final ainda preenchida');
    igual(app.estado.ocorrencias.length, 0, 'nada salvo');
    modal.remove();

    return 'seguiu até o fim e listou o campo problemático';
  });

  teste('Classifica o serviço pela descrição do chamado', async function () {
    configurarPadrao();
    NV().config.definirPresetAtivo('ti-automatico');
    const app = window.AppFalso.montar({
      numero: '202602691',
      descricao: 'computador da enfermagem nao esta ligando'
    });

    const resultado = await NV().fluxo.fecharOS({ agora: new Date(2026, 7, 28, 9, 19) });
    afirmar(resultado.ok, 'fluxo falhou: ' + resultado.erro + ' (passo: ' + resultado.passo + ')');
    igual(app.estado.ocorrencias[0].servico, 'LIGAR EQUIPAMENTO', 'serviço escolhido pela descrição');
    igual(app.estado.ocorrencias[0].inicio, '28/08/2026, 09:18', 'início');
    igual(app.estado.ocorrencias[0].fim, '28/08/2026, 09:19', 'fim');

    const passo = resultado.passos.filter(function (p) {
      return /Classificar serviço/.test(p.passo);
    })[0];
    afirmar(passo, 'deveria existir o passo de classificação');
    igual(passo.resultado.origem, 'regra', 'origem da decisão');

    configurarPadrao();
    return 'descrição “nao esta ligando” → LIGAR EQUIPAMENTO (por regra)';
  });

  teste('Data da Ocorrência fica exatamente 1 minuto antes da Data Final', async function () {
    configurarPadrao();
    const app = window.AppFalso.montar({ numero: '202602691' });

    await NV().fluxo.fecharOS({ agora: new Date(2026, 7, 28, 15, 30, 45) });
    const o = app.estado.ocorrencias[0];
    igual(o.inicio, '28/08/2026, 15:29', 'Data da Ocorrência');
    igual(o.fim, '28/08/2026, 15:30', 'Data Final do Serviço');

    const diferenca = NV().dates.parse(o.fim).getTime() - NV().dates.parse(o.inicio).getTime();
    igual(diferenca, 60000, 'diferença em milissegundos');

    return 'sempre 60s de diferença, mesmo com duração configurada em 0';
  });

  teste('Funciona com a OS dentro de um iframe (janelas MDI do ASP.NET)', async function () {
    configurarPadrao();
    const app = window.AppFalso.emIframe({ numero: '202602691' });
    if (!app) return { pulado: 'o navegador bloqueou o acesso ao iframe (comum ao abrir via file://)' };

    await esperar(150);
    const docs = NV().dom.documentos();
    afirmar(docs.length >= 2, 'deveria enxergar o documento do iframe');

    const resultado = await NV().fluxo.fecharOS({ agora: new Date(2026, 7, 28, 16, 45) });
    afirmar(resultado.ok, 'fluxo falhou dentro do iframe: ' + resultado.erro + ' (passo: ' + resultado.passo + ')');
    igual(app.estado.ocorrencias.length, 1, 'ocorrência lançada no iframe');
    igual(app.estado.ocorrencias[0].inicio, '28/08/2026, 16:44', 'início');
    igual(app.estado.fechada, true, 'a OS no iframe deveria estar encerrada');

    return 'ocorrência e fechamento executados dentro do frame';
  });

  /* ------------------------------ relatório ------------------------------ */

  function criarRelatorio() {
    const host = document.createElement('div');
    host.setAttribute('data-nv-ui', 'autoteste');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483600;overflow:auto;background:rgba(8,10,13,.94)';
    host.innerHTML =
      '<div style="max-width:820px;margin:28px auto;padding:0 20px;font:14px/1.5 system-ui,Segoe UI,sans-serif;color:#e8eaed">' +
      '<h1 style="font-size:20px;margin:0 0 4px">Autoteste do Neovero+</h1>' +
      '<p style="margin:0 0 18px;color:#9aa4b2">Executa o fluxo real de fechamento sobre uma réplica da tela do Neovero. ' +
      'Nenhum chamado de verdade é tocado.</p>' +
      '<div data-resumo style="padding:12px 14px;border-radius:10px;background:#161b22;border:1px solid #2c3138;margin-bottom:14px">Executando…</div>' +
      '<ol data-lista style="list-style:none;padding:0;margin:0;display:grid;gap:8px"></ol>' +
      '<div style="display:flex;gap:8px;margin:18px 0 40px">' +
      '<button data-copiar style="background:#10b981;color:#06281f;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer">Copiar relatório</button>' +
      '<button data-repetir style="background:#232830;color:#dfe3e8;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer">Rodar de novo</button>' +
      '<button data-fechar style="background:#232830;color:#dfe3e8;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer">Ver a tela de demonstração</button>' +
      '</div></div>';
    document.body.appendChild(host);

    host.querySelector('[data-copiar]').addEventListener('click', function () {
      navigator.clipboard.writeText(textoDoRelatorio()).then(
        function () {
          host.querySelector('[data-copiar]').textContent = 'Copiado!';
        },
        function () {
          window.prompt('Copie o relatório:', textoDoRelatorio());
        }
      );
    });
    host.querySelector('[data-repetir]').addEventListener('click', function () {
      location.reload();
    });
    host.querySelector('[data-fechar]').addEventListener('click', function () {
      host.remove();
      window.AppFalso.montar({ numero: '202602691' });
    });

    return host;
  }

  const resultados = [];

  function textoDoRelatorio() {
    const linhas = [
      'Autoteste Neovero+ ' + (window.NV ? window.NV.VERSAO : '?'),
      'Navegador: ' + navigator.userAgent,
      'Página: ' + location.href,
      ''
    ];
    resultados.forEach(function (r) {
      const marca = r.estado === 'ok' ? 'OK   ' : r.estado === 'pulado' ? 'PULOU' : 'FALHA';
      linhas.push(marca + ' | ' + r.nome + ' (' + r.ms + 'ms)' + (r.detalhe ? ' — ' + r.detalhe : ''));
    });
    const falhas = resultados.filter(function (r) {
      return r.estado === 'falha';
    }).length;
    linhas.push('');
    linhas.push('Resultado: ' + (resultados.length - falhas) + '/' + resultados.length + ' passaram');
    return linhas.join('\n');
  }

  function renderizar() {
    const lista = relatorio.querySelector('[data-lista]');
    lista.innerHTML = resultados
      .map(function (r) {
        const cor = r.estado === 'ok' ? '#34d399' : r.estado === 'pulado' ? '#fbbf24' : '#f87171';
        const icone = r.estado === 'ok' ? '✓' : r.estado === 'pulado' ? '·' : '✕';
        return (
          '<li style="padding:10px 12px;border-radius:10px;background:#161b22;border:1px solid #2c3138">' +
          '<div style="display:flex;gap:10px;align-items:baseline">' +
          '<span style="color:' + cor + ';font-weight:700">' + icone + '</span>' +
          '<span style="flex:1">' + r.nome + '</span>' +
          '<span style="color:#8b95a3;font-size:12px">' + r.ms + 'ms</span></div>' +
          (r.detalhe
            ? '<div style="margin:6px 0 0 24px;color:' +
              (r.estado === 'falha' ? '#fca5a5' : '#8b95a3') +
              ';font-size:12px;white-space:pre-wrap">' +
              String(r.detalhe).replace(/[<>&]/g, '') +
              '</div>'
            : '') +
          '</li>'
        );
      })
      .join('');

    const falhas = resultados.filter(function (r) {
      return r.estado === 'falha';
    });
    const resumo = relatorio.querySelector('[data-resumo]');
    if (resultados.length < testes.length) {
      resumo.textContent = 'Executando… (' + resultados.length + '/' + testes.length + ')';
      resumo.style.borderColor = '#2c3138';
      return;
    }
    if (falhas.length) {
      resumo.innerHTML =
        '<b style="color:#f87171">' + falhas.length + ' de ' + testes.length + ' verificações falharam.</b><br>' +
        'Clique em “Copiar relatório” e mande o texto — com ele dá para identificar o ajuste necessário.';
      resumo.style.borderColor = '#7f1d1d';
    } else {
      resumo.innerHTML =
        '<b style="color:#34d399">Tudo certo: ' + testes.length + '/' + testes.length + ' verificações passaram.</b><br>' +
        'A automação funciona neste navegador. O próximo passo é instalar o script e usar o botão ' +
        '“Simular” em um chamado real.';
      resumo.style.borderColor = '#065f46';
    }
  }

  async function executar() {
    relatorio = criarRelatorio();
    for (let i = 0; i < testes.length; i += 1) {
      const t = testes[i];
      const inicio = Date.now();
      try {
        const saida = await t.fn();
        const pulado = saida && saida.pulado;
        resultados.push({
          nome: t.nome,
          estado: pulado ? 'pulado' : 'ok',
          detalhe: pulado ? saida.pulado : saida || '',
          ms: Date.now() - inicio
        });
      } catch (erro) {
        resultados.push({
          nome: t.nome,
          estado: 'falha',
          detalhe: String((erro && erro.message) || erro),
          ms: Date.now() - inicio
        });
      }
      renderizar();
      await esperar(60);
    }
    renderizar();
  }

  /* Espera o Neovero+ detectar a página e montar o painel. */
  (async function iniciar() {
    const limite = Date.now() + 15000;
    while (Date.now() < limite) {
      if (window.NV && window.NV.fluxo && document.querySelector('[data-nv-ui="painel"]')) break;
      await esperar(200);
    }
    if (window.NV) window.NV.log.console = true;
    await executar();
  })();
})();
