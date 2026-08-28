/* Espera ativa com timeout: a UI do Neovero renderiza de forma assíncrona. */
(function (NV) {
  'use strict';

  const async = {};

  class PassoError extends Error {
    constructor(mensagem, detalhes) {
      super(mensagem);
      this.name = 'PassoError';
      Object.assign(this, detalhes || {});
    }
  }
  async.PassoError = PassoError;

  async.sleep = function (ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
  };

  /*
   * Reavalia `fn` até devolver algo "verdadeiro" (elemento, objeto, true).
   * Rejeita com PassoError quando estoura o timeout.
   */
  async.waitFor = async function (fn, options) {
    const opts = options || {};
    const timeout = opts.timeout != null ? opts.timeout : 10000;
    const intervalo = opts.intervalo != null ? opts.intervalo : 120;
    const rotulo = opts.rotulo || 'condição';
    const limite = Date.now() + timeout;
    let ultimoErro = null;

    for (;;) {
      try {
        const resultado = await fn();
        if (resultado) return resultado;
        ultimoErro = null;
      } catch (erro) {
        ultimoErro = erro;
      }
      if (Date.now() >= limite) {
        throw new PassoError('Tempo esgotado esperando ' + rotulo + ' (' + timeout + 'ms)', {
          rotulo: rotulo,
          causa: ultimoErro ? String(ultimoErro.message || ultimoErro) : null
        });
      }
      await async.sleep(intervalo);
    }
  };

  /* Espera até que a condição deixe de ser verdadeira (ex.: modal fechar). */
  async.waitUntilGone = function (fn, options) {
    return async.waitFor(async function () {
      const valor = await fn();
      return valor ? false : true;
    }, options);
  };

  async.tentar = async function (fn, options) {
    const opts = options || {};
    const tentativas = Math.max(1, opts.tentativas || 3);
    const espera = opts.espera != null ? opts.espera : 250;
    let ultimo = null;
    for (let i = 0; i < tentativas; i += 1) {
      try {
        return await fn(i);
      } catch (erro) {
        ultimo = erro;
        if (i < tentativas - 1) await async.sleep(espera * (i + 1));
      }
    }
    throw ultimo;
  };

  NV.async = async;
})((globalThis.NV = globalThis.NV || {}));
