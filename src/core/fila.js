/*
 * Fila de atendimento: fechar chamados a partir da lista do Monitor, sem abrir
 * cada OS à mão. A ordem é a da própria lista; o que já foi processado nesta
 * sessão é ignorado, porque a lista do Neovero pode levar um tempo para atualizar.
 */
(function (NV) {
  'use strict';

  const async = NV.async;
  const fila = {};

  const TTL_CACHE = 1500;
  let cache = { em: 0, itens: [] };

  fila.processados = new Set();
  fila.ignorados = new Set();

  fila.limparMemoria = function () {
    fila.processados.clear();
    fila.ignorados.clear();
    cache = { em: 0, itens: [] };
  };

  /*
   * Itens visíveis na lista. `cache` evita varrer o DOM a cada movimento do mouse
   * (o botão que aparece sobre a linha consulta isso a todo instante).
   */
  fila.itens = function (options) {
    const opts = options || {};
    if (opts.cache !== false && Date.now() - cache.em < TTL_CACHE) return cache.itens;
    cache = { em: Date.now(), itens: NV.localizar.itensDoMonitor() };
    return cache.itens;
  };

  fila.pendentes = function (options) {
    return fila.itens(options).filter(function (item) {
      return !fila.processados.has(item.numero) && !fila.ignorados.has(item.numero);
    });
  };

  fila.contar = function (options) {
    return fila.pendentes(options).length;
  };

  fila.porNumero = function (numero, options) {
    return (
      fila.itens(options).filter(function (item) {
        return item.numero === numero;
      })[0] || null
    );
  };

  /* Fecha uma OS específica: abre pela lista, roda o fluxo e registra o resultado. */
  fila.fecharUm = async function (numero, options) {
    const opts = options || {};
    const cfg = NV.config.obter();
    let resultado;
    try {
      await NV.lote.abrirOs(numero, cfg.tempos);
      await async.sleep(300);
      resultado = await NV.fluxo.fecharOS(opts);
    } catch (erro) {
      resultado = { ok: false, erro: String(erro.message || erro) };
    }
    resultado.numeroOs = resultado.numeroOs || numero;

    if (resultado.ok && resultado.fechada) fila.processados.add(numero);
    else if (!resultado.cancelado) fila.ignorados.add(numero);
    cache = { em: 0, itens: [] };

    NV.log.info('Fila: OS ' + numero + (resultado.ok ? ' fechada' : ' não fechada'), {
      erro: resultado.erro || null,
      passo: resultado.passo || null
    });
    return resultado;
  };

  fila.proximo = function () {
    return fila.pendentes({ cache: false })[0] || null;
  };

  fila.fecharProximo = async function (options) {
    const item = fila.proximo();
    if (!item) return { ok: false, vazia: true, erro: 'Nenhuma OS pendente na lista' };
    return fila.fecharUm(item.numero, options);
  };

  /*
   * Sequência contínua: fecha um após o outro até a lista esvaziar, o limite ser
   * atingido, dar erro (quando configurado para parar) ou o usuário cancelar.
   * options: { aoProgresso, sinal, limite, ...opções do fluxo }
   */
  fila.fecharEmSequencia = async function (options) {
    const opts = options || {};
    const cfg = NV.config.obter();
    const sinal = opts.sinal || NV.fluxo.criarSinal();
    const limite = Math.max(1, opts.limite || cfg.lote.maximo);
    const resultados = [];

    for (let i = 0; i < limite; i += 1) {
      if (sinal.cancelado) break;
      const item = fila.proximo();
      if (!item) break;
      if (opts.aoProgresso) {
        opts.aoProgresso({
          tipo: 'os',
          numero: item.numero,
          indice: resultados.length + 1,
          total: Math.min(limite, resultados.length + 1 + fila.contar({ cache: false })),
          fase: 'fila'
        });
      }
      const resultado = await fila.fecharUm(item.numero, Object.assign({}, opts, { sinal: sinal }));
      resultados.push(resultado);
      if (resultado.cancelado) break;
      if (!resultado.ok && cfg.lote.pararNoPrimeiroErro) break;
      if (fila.proximo()) await async.sleep(cfg.lote.esperaEntreOs);
    }

    return {
      processadas: resultados.length,
      sucesso: resultados.filter(function (r) {
        return r.ok && r.fechada;
      }).length,
      falhas: resultados.filter(function (r) {
        return !r.ok;
      }),
      restantes: fila.contar({ cache: false }),
      resultados: resultados
    };
  };

  NV.fila = fila;
})((globalThis.NV = globalThis.NV || {}));
