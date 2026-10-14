/*
 * Fila de atendimento: fechar chamados a partir da lista do Monitor, sem abrir
 * cada OS à mão. A ordem é a da própria lista. O que já foi fechado nesta sessão
 * sai da fila, porque a lista do Neovero pode levar um tempo para atualizar.
 * Uma falha também sai da passada, para a sequência seguir; "Tentar de novo"
 * devolve só essas OS, com o serviço já escolhido na revisão.
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

  /* Devolve OS à fila para a tentativa seguinte, sem reclassificar. */
  fila.reativar = function (numeros) {
    (numeros || []).forEach(function (numero) {
      const chave = String(numero);
      fila.ignorados.delete(chave);
      fila.processados.delete(chave);
    });
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
    const presetBase = opts.preset || NV.config.presetAtivo();
    const revisado = opts.servicosPorOs && opts.servicosPorOs[numero];
    const preset = revisado
      ? Object.assign({}, presetBase, { servico: revisado, servicoAutomatico: false })
      : presetBase;
    let resultado;
    try {
      await NV.lote.abrirOs(numero, cfg.tempos);
      await async.sleep(300);
      resultado = await NV.fluxo.fecharOS(Object.assign({}, opts, { preset: preset }));
    } catch (erro) {
      resultado = { ok: false, erro: String(erro.message || erro) };
    }
    resultado.numeroOs = resultado.numeroOs || numero;
    resultado.servicoUsado = (preset && preset.servico) || resultado.servicoUsado || null;

    if (resultado.ok && resultado.fechada) {
      fila.ignorados.delete(numero);
      fila.processados.add(numero);
    } else if (!resultado.cancelado) fila.ignorados.add(numero);
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
   * Sequência contínua. Segue depois de uma falha; "Parar no 1º erro" deixa o
   * restante em `pendentes`. O serviço revisado entra fixo, sem classificar de novo.
   * options: { numeros, servicosPorOs, aoProgresso, sinal, limite, fase, ...fluxo }
   */
  fila.fecharEmSequencia = async function (options) {
    const opts = options || {};
    const cfg = NV.config.obter();
    const sinal = opts.sinal || NV.fluxo.criarSinal();
    const limite = Math.max(1, opts.limite || cfg.lote.maximo);
    const pedidos = opts.numeros || fila.pendentes({ cache: false }).map(function (item) {
      return item.numero;
    });
    const numeros = pedidos.slice(0, limite);
    const resultados = [];
    let pendentes = [];
    let interrompido = false;
    let motivo = null;

    for (let i = 0; i < numeros.length; i += 1) {
      if (sinal.cancelado) {
        interrompido = true;
        motivo = 'cancelado';
        pendentes = numeros.slice(i);
        break;
      }
      const numero = numeros[i];
      if (opts.aoProgresso) {
        opts.aoProgresso({
          tipo: 'os',
          numero: numero,
          indice: i + 1,
          total: numeros.length,
          fase: opts.fase || 'fila'
        });
      }
      const resultado = await fila.fecharUm(numero, Object.assign({}, opts, { sinal: sinal }));
      resultados.push(resultado);

      if (resultado.cancelado || sinal.cancelado) {
        interrompido = true;
        motivo = 'cancelado';
        pendentes = numeros.slice(i + 1);
        break;
      }
      if (!resultado.ok && cfg.lote.pararNoPrimeiroErro) {
        interrompido = true;
        motivo = 'erro';
        pendentes = numeros.slice(i + 1);
        break;
      }
      if (i < numeros.length - 1) await async.sleep(cfg.lote.esperaEntreOs);
    }

    return {
      total: numeros.length,
      processadas: resultados.length,
      sucesso: resultados.filter(function (r) {
        return r.ok && r.fechada;
      }).length,
      falhas: resultados.filter(function (r) {
        return !r.ok;
      }),
      pendentes: pendentes,
      interrompido: interrompido,
      motivo: motivo,
      restantes: fila.contar({ cache: false }),
      resultados: resultados
    };
  };

  NV.fila = fila;
})((globalThis.NV = globalThis.NV || {}));
