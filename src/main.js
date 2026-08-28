/* Ponto de entrada: detecta se a página é o Neovero e monta o painel. */
(function (NV) {
  'use strict';

  NV.VERSAO = '__VERSAO__';

  function pareceNeovero() {
    const cfg = NV.config.obter();
    if (cfg.hostsLiberados.indexOf(location.host) >= 0) return true;
    if (/neovero/i.test(location.hostname)) return true;
    if (/neovero/i.test(document.title)) return true;
    const corpo = (document.body && document.body.innerText) || '';
    if (/neovero/i.test(corpo)) return true;
    return /monitor de atendimento/i.test(corpo) && /ordem de servi/i.test(corpo);
  }

  /* O script roda em todos os frames; só um painel deve aparecer. */
  function jaMontadoEmOutroFrame() {
    try {
      return !!window.top.__neoveroMaisMontado;
    } catch (erro) {
      return false;
    }
  }

  function marcarMontado() {
    try {
      window.top.__neoveroMaisMontado = true;
    } catch (erro) {
      /* frame de outra origem: segue sem marcar */
    }
  }

  async function iniciar() {
    NV.config.carregar();
    NV.log.console = NV.config.obter().logNoConsole;

    if (!document.body) {
      await new Promise(function (resolve) {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }

    /* Dá preferência ao frame principal: subframes esperam um pouco mais. */
    if (window !== window.top) await NV.async.sleep(4000);

    /* A aplicação é uma SPA: a tela pode levar alguns segundos para existir. */
    const limite = Date.now() + 60000;
    while (Date.now() < limite) {
      if (pareceNeovero() && !jaMontadoEmOutroFrame()) {
        marcarMontado();
        NV.painel.montar();
        NV.log.info('Neovero+ ativo', { versao: NV.VERSAO, host: location.host });
        globalThis.NeoveroMais = NV;
        /* Se a aplicação trocar o conteúdo da página, o painel é remontado. */
        setInterval(function () {
          if (!NV.painel.montado() && pareceNeovero()) NV.painel.montar();
        }, 5000);
        return;
      }
      await NV.async.sleep(1500);
    }
    NV.log.info('Neovero não detectado nesta página; painel não foi montado');
    globalThis.NeoveroMais = NV;
  }

  iniciar().catch(function (erro) {
    console.error('[Neovero+] falha ao iniciar', erro);
  });
})((globalThis.NV = globalThis.NV || {}));
