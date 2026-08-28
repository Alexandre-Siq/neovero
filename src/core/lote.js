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
