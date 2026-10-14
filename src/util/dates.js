/* Datas no formato brasileiro usado pelo Neovero: "28/08/2026, 09:18". */
(function (NV) {
  'use strict';

  const dates = {};
  const pad = (n) => String(n).padStart(2, '0');

  dates.format = function (date, options) {
    const opts = options || {};
    const d = date instanceof Date ? date : new Date(date);
    const dia = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    const hora = pad(d.getHours()) + ':' + pad(d.getMinutes()) + (opts.segundos ? ':' + pad(d.getSeconds()) : '');
    const separador = opts.virgula === false ? ' ' : ', ';
    return dia + separador + hora;
  };

  /* Aceita dd/MM/yyyy com hora opcional, com ou sem vírgula, com ou sem segundos. */
  dates.parse = function (value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value || ''));
    if (!m) return null;
    const d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0),
      0
    );
    if (Number.isNaN(d.getTime())) return null;
    if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
    return d;
  };

  dates.addMinutes = function (date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
  };

  dates.truncateSeconds = function (date) {
    const d = new Date(date.getTime());
    d.setSeconds(0, 0);
    return d;
  };

  /* O Neovero recusa ocorrência com início igual ou posterior ao fim. */
  dates.FOLGA_MINIMA_MIN = 1;

  /*
   * Calcula início/fim da ocorrência a partir da regra do preset.
   *   agora        -> termina agora, começa `duracaoMin` antes
   *   inicioAgora  -> começa agora, termina `duracaoMin` depois
   *   abertura     -> começa na abertura da OS (quando conhecida), termina agora
   *
   * Em qualquer regra é garantido pelo menos 1 minuto entre início e fim.
   */
  dates.resolve = function (regra, contexto) {
    const cfg = regra || {};
    const ctx = contexto || {};
    const modo = cfg.modo || 'agora';
    const folga = dates.FOLGA_MINIMA_MIN;
    const duracao = Math.max(folga, Number(cfg.duracaoMin != null ? cfg.duracaoMin : folga));
    const agora = dates.truncateSeconds(ctx.agora ? new Date(ctx.agora) : new Date());
    let inicio;
    let fim;

    if (modo === 'inicioAgora') {
      inicio = agora;
      fim = dates.addMinutes(agora, duracao);
    } else if (modo === 'abertura') {
      const abertura = dates.parse(ctx.aberturaOS);
      inicio = abertura ? dates.truncateSeconds(abertura) : dates.addMinutes(agora, -duracao);
      fim = agora;
    } else {
      inicio = dates.addMinutes(agora, -duracao);
      fim = agora;
    }

    if (fim.getTime() - inicio.getTime() < folga * 60000) {
      inicio = dates.addMinutes(fim, -folga);
    }
    return { inicio: inicio, fim: fim };
  };

  NV.dates = dates;
})((globalThis.NV = globalThis.NV || {}));
