/* Comparação de texto tolerante a acentos, caixa, espaços e marcadores de campo obrigatório. */
(function (NV) {
  'use strict';

  const text = {};

  text.stripAccents = function (value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  text.normalize = function (value) {
    return text
      .stripAccents(value)
      .replace(/\u00a0/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  };

  /* Rótulos vêm com asterisco de obrigatório, dois-pontos ou ícones colados. */
  text.normalizeLabel = function (value) {
    return text
      .normalize(value)
      .replace(/^[\s*:•·\-|]+/, '')
      .replace(/[\s*:•·\-|]+$/, '')
      .trim();
  };

  text.equals = function (a, b) {
    return text.normalizeLabel(a) === text.normalizeLabel(b);
  };

  text.includes = function (haystack, needle) {
    const n = text.normalize(needle);
    if (!n) return false;
    return text.normalize(haystack).includes(n);
  };

  text.tokens = function (value) {
    return text
      .normalize(value)
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  };

  /* Só letras e números: absorve diferenças de pontuação e espaçamento. */
  text.somenteAlfanumerico = function (value) {
    return text.normalize(value).replace(/[^a-z0-9]/g, '');
  };

  /* 1 = igual, 0 = sem relação. Usado para escolher a melhor opção de um combo. */
  text.score = function (candidate, target) {
    const c = text.normalizeLabel(candidate);
    const t = text.normalizeLabel(target);
    if (!c || !t) return 0;
    if (c === t) return 1;
    /* "TONNER/CILINDRO" e "TONNER / CILINDRO" são o mesmo item na prática. */
    const ca = text.somenteAlfanumerico(c);
    const ta = text.somenteAlfanumerico(t);
    if (ca && ca === ta) return 0.98;
    if (c.startsWith(t) || t.startsWith(c)) return 0.9;
    if (c.includes(t)) return 0.8;
    if (t.includes(c)) return 0.7;
    const ct = text.tokens(c);
    const tt = text.tokens(t);
    if (!ct.length || !tt.length) return 0;
    const common = tt.filter((token) => ct.includes(token)).length;
    if (!common) return 0;
    return 0.6 * (common / Math.max(ct.length, tt.length));
  };

  /* Retorna { item, score } do candidato mais parecido, ou null se nada passar do mínimo. */
  text.pickBest = function (candidates, target, options) {
    const opts = options || {};
    const getText = opts.getText || ((item) => item);
    const min = typeof opts.min === 'number' ? opts.min : 0.6;
    let best = null;
    (candidates || []).forEach(function (item) {
      const score = text.score(getText(item), target);
      if (score >= min && (!best || score > best.score)) best = { item: item, score: score };
    });
    return best;
  };

  text.truncate = function (value, max) {
    const limit = max || 160;
    const str = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return str.length > limit ? str.slice(0, limit - 1) + '…' : str;
  };

  NV.text = text;
})((globalThis.NV = globalThis.NV || {}));
