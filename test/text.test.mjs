import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/util/text.js');
const { text } = globalThis.NV;

test('normaliza acentos, caixa e espaços', () => {
  assert.equal(text.normalize('  CONFIGURAÇÃO   de  Equipamentos '), 'configuracao de equipamentos');
  assert.equal(text.normalize('Ocorrência'), 'ocorrencia');
});

test('rótulo ignora marcador de obrigatório', () => {
  assert.equal(text.normalizeLabel('Ocorrência *'), 'ocorrencia');
  assert.equal(text.normalizeLabel('Data Final do Serviço:'), 'data final do servico');
  assert.ok(text.equals('Serviço *', 'servico'));
});

test('score prioriza igualdade e reconhece variações', () => {
  assert.equal(text.score('SUPORTE - TI', 'suporte - ti'), 1);
  assert.ok(text.score('SUPORTE - TI (INTERNO)', 'SUPORTE - TI') > 0.7);
  assert.equal(text.score('ALMOXARIFADO', 'SUPORTE - TI'), 0);
});

test('pickBest escolhe a opção mais parecida acima do mínimo', () => {
  const opcoes = ['CONFIGURAÇÃO DE REDE', 'CONFIGURAÇÃO DE EQUIPAMENTOS', 'MANUTENÇÃO'];
  const melhor = text.pickBest(opcoes, 'configuracao de equipamentos');
  assert.equal(melhor.item, 'CONFIGURAÇÃO DE EQUIPAMENTOS');
  assert.equal(text.pickBest(opcoes, 'troca de toner'), null);
});

test('truncate encurta preservando limite', () => {
  assert.equal(text.truncate('abcdefghij', 5), 'abcd…');
  assert.equal(text.truncate('abc', 5), 'abc');
});
