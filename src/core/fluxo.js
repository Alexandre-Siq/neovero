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
        return fluxo.confirmarDialogo(tempos, 1200);
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
