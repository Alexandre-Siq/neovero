import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/util/text.js');
await import('../src/util/dates.js');
const { dates } = globalThis.NV;

test('formata no padrão do Neovero', () => {
  assert.equal(dates.format(new Date(2026, 7, 28, 9, 18)), '28/08/2026, 09:18');
  assert.equal(dates.format(new Date(2026, 7, 28, 9, 18), { virgula: false }), '28/08/2026 09:18');
  assert.equal(dates.format(new Date(2026, 7, 28, 9, 18, 7), { segundos: true }), '28/08/2026, 09:18:07');
});

test('interpreta data com e sem vírgula, hora e segundos', () => {
  assert.equal(dates.parse('28/08/2026, 09:18').getTime(), new Date(2026, 7, 28, 9, 18).getTime());
  assert.equal(dates.parse('28/08/2026 09:18:33').getTime(), new Date(2026, 7, 28, 9, 18, 33).getTime());
  assert.equal(dates.parse('14/08/2026').getTime(), new Date(2026, 7, 14, 0, 0).getTime());
  assert.equal(dates.parse('solucionada em 28/08/2026 09:19').getTime(), new Date(2026, 7, 28, 9, 19).getTime());
});

test('rejeita data inválida', () => {
  assert.equal(dates.parse('32/08/2026'), null);
  assert.equal(dates.parse('sem data'), null);
  assert.equal(dates.parse(''), null);
});

test('regra "agora": termina agora e começa antes conforme duração', () => {
  const agora = new Date(2026, 7, 28, 9, 19, 42);
  const r = dates.resolve({ modo: 'agora', duracaoMin: 1 }, { agora });
  assert.equal(dates.format(r.fim), '28/08/2026, 09:19');
  assert.equal(dates.format(r.inicio), '28/08/2026, 09:18');
});

test('regra "inicioAgora": começa agora e termina depois', () => {
  const agora = new Date(2026, 7, 28, 9, 19);
  const r = dates.resolve({ modo: 'inicioAgora', duracaoMin: 15 }, { agora });
  assert.equal(dates.format(r.inicio), '28/08/2026, 09:19');
  assert.equal(dates.format(r.fim), '28/08/2026, 09:34');
});

test('regra "abertura": usa a abertura da OS quando disponível', () => {
  const agora = new Date(2026, 7, 28, 9, 19);
  const r = dates.resolve({ modo: 'abertura', duracaoMin: 1 }, { agora, aberturaOS: '14/08/2026, 09:51' });
  assert.equal(dates.format(r.inicio), '14/08/2026, 09:51');
  assert.equal(dates.format(r.fim), '28/08/2026, 09:19');
});

test('regra "abertura" cai para a duração quando a abertura não foi lida', () => {
  const agora = new Date(2026, 7, 28, 9, 19);
  const r = dates.resolve({ modo: 'abertura', duracaoMin: 10 }, { agora, aberturaOS: null });
  assert.equal(dates.format(r.inicio), '28/08/2026, 09:09');
});

test('início nunca passa do fim', () => {
  const agora = new Date(2026, 7, 28, 9, 19);
  const r = dates.resolve({ modo: 'abertura', duracaoMin: 0 }, { agora, aberturaOS: '30/08/2026, 10:00' });
  assert.ok(r.inicio.getTime() <= r.fim.getTime());
});
