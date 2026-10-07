/* Log em memória: alimenta o painel e o arquivo de diagnóstico. */
(function (NV) {
  'use strict';

  const MAX = 500;
  const entradas = [];
  const ouvintes = new Set();

  function registrar(nivel, mensagem, dados) {
    const entrada = {
      t: new Date().toISOString(),
      nivel: nivel,
      mensagem: String(mensagem),
      dados: dados == null ? null : dados
    };
    entradas.push(entrada);
    if (entradas.length > MAX) entradas.splice(0, entradas.length - MAX);
    ouvintes.forEach(function (fn) {
      try {
        fn(entrada);
      } catch (erro) {
        /* um ouvinte quebrado não pode derrubar o fluxo */
      }
    });
    if (NV.log.console) {
      const prefixo = '[Neovero+]';
      if (nivel === 'erro') console.error(prefixo, mensagem, dados || '');
      else if (nivel === 'aviso') console.warn(prefixo, mensagem, dados || '');
      else console.log(prefixo, mensagem, dados || '');
    }
    return entrada;
  }

  NV.log = {
    console: false,
    info: (m, d) => registrar('info', m, d),
    passo: (m, d) => registrar('passo', m, d),
    aviso: (m, d) => registrar('aviso', m, d),
    erro: (m, d) => registrar('erro', m, d),
    entradas: () => entradas.slice(),
    limpar: () => entradas.splice(0, entradas.length),
    inscrever: function (fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    }
  };
})((globalThis.NV = globalThis.NV || {}));
