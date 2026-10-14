/*
 * A revisão do lote não pede confirmação linha a linha quando a regra é firme.
 * Corrigir um duvidoso grava a palavra como regra para o próximo lote.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();
await import('../src/ui/estilos.js');
await import('../src/ui/aprender.js');
await import('../src/ui/lista.js');
await import('../src/ui/painel.js');

function preparar() {
  NV.config.restaurarPadrao();
  montarApp();
  NV.painel.montar();
  const sombra = document.querySelector('[data-nv-ui="painel"]').shadowRoot;
  sombra.querySelectorAll('.sobreposicao').forEach(function (el) {
    el.remove();
  });
  return sombra;
}

const OPCOES = ['SUBSTITUIÇÃO DE TONNER/CILINDRO', 'CONFIGURAÇÃO DE EQUIPAMENTOS', 'VERIFICAÇÃO DE EQUIPAMENTO'];

function itens() {
  return [
    {
      numero: '202600001',
      descricao: 'impressora sem tonner na recepção',
      servico: 'SUBSTITUIÇÃO DE TONNER/CILINDRO',
      origem: 'regra',
      sugestao: { confianca: 0.95, escolhido: 'SUBSTITUIÇÃO DE TONNER/CILINDRO' }
    },
    {
      numero: '202600002',
      descricao: 'projetor da sala sem imagem',
      servico: 'CONFIGURAÇÃO DE EQUIPAMENTOS',
      origem: 'preset',
      sugestao: null
    }
  ];
}

test('revisão mostra só o duvidoso e a correção vira regra', async () => {
  const sombra = preparar();
  const promessa = NV.painel.revisarClassificacaoDoLote(itens(), OPCOES);
  const sobre = sombra.querySelector('.sobreposicao');

  assert.equal(sobre.querySelectorAll('select').length, 1, 'só o duvidoso tem combo');
  assert.equal(sobre.querySelectorAll('input[data-firme]').length, 1);
  assert.equal(sobre.querySelector('details').open, false, 'os firmes ficam recolhidos');
  assert.match(sobre.querySelector('summary').textContent, /1/);
  assert.match(sobre.textContent, /1 para conferir/);

  const sel = sobre.querySelector('select');
  assert.equal(sobre.querySelector('[data-aprender-linha]').style.display, 'none');
  sel.value = 'VERIFICAÇÃO DE EQUIPAMENTO';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(sobre.querySelector('[data-aprender-linha]').style.display, 'flex');
  assert.equal(sobre.querySelector('[data-palavra]').value, 'projetor');

  sobre.querySelector('[data-executar]').click();
  const revisado = await promessa;

  assert.deepEqual(revisado.numeros, ['202600001', '202600002']);
  assert.equal(revisado.servicosPorOs['202600001'], 'SUBSTITUIÇÃO DE TONNER/CILINDRO');
  assert.equal(revisado.servicosPorOs['202600002'], 'VERIFICAÇÃO DE EQUIPAMENTO');
  assert.equal(revisado.regrasCriadas, 1);

  const deNovo = NV.classificar.sugerir('projetor da sala sem imagem', OPCOES, {
    regras: NV.config.regrasDeClassificacao()
  });
  assert.equal(deNovo.escolhido, 'VERIFICAÇÃO DE EQUIPAMENTO');
  assert.equal(deNovo.origem, 'regra');
});

test('desmarcar o firme e limpar o duvidoso tira os dois do lote', async () => {
  const sombra = preparar();
  const promessa = NV.painel.revisarClassificacaoDoLote(itens(), OPCOES);
  const sobre = sombra.querySelector('.sobreposicao');

  sobre.querySelector('input[data-firme]').checked = false;
  const sel = sobre.querySelector('select');
  sel.value = '';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(sobre.querySelector('[data-aprender-linha]').style.display, 'none');

  sobre.querySelector('[data-executar]').click();
  const revisado = await promessa;

  assert.deepEqual(revisado.numeros, []);
  assert.equal(revisado.regrasCriadas, 0);
  assert.equal(NV.config.obter().classificacao.regras.length, 0, 'não grava regra sem correção');
});

test('o combo da revisão passa de CONFIGURAÇÃO DE RIS/PACS e a busca filtra', async () => {
  const sombra = preparar();
  const corte = NV.classificar.SERVICOS_CONHECIDOS.indexOf('CONFIGURAÇÃO DE RIS/PACS FIDI');
  const fatia = NV.classificar.SERVICOS_CONHECIDOS.slice(0, corte + 1);
  const promessa = NV.painel.revisarClassificacaoDoLote(itens(), fatia);
  const sobre = sombra.querySelector('.sobreposicao');
  const sel = sobre.querySelector('select');
  const textos = Array.prototype.map.call(sel.options, function (o) {
    return o.value;
  });

  assert.equal(sel.size, 8);
  assert.ok(textos.indexOf('SUBSTITUIÇÃO DE TONNER/CILINDRO') > textos.indexOf('CONFIGURAÇÃO DE RIS/PACS FIDI'));
  assert.ok(textos.includes('RESET DE SENHA NEOVERO'));
  assert.ok(textos.includes('VERIFICAÇÃO DE EQUIPAMENTO'));
  assert.match(sobre.textContent, /role ou busque/);

  const filtro = sobre.querySelector('[data-filtro]');
  filtro.value = 'tonner';
  filtro.dispatchEvent(new Event('input', { bubbles: true }));
  const visiveis = Array.prototype.filter
    .call(sel.options, function (o) {
      return o.value && !o.hidden;
    })
    .map(function (o) {
      return o.value;
    });
  assert.deepEqual(visiveis, ['SUBSTITUIÇÃO DE TONNER/CILINDRO']);

  sobre.querySelector('[data-cancelar]').click();
  assert.equal(await promessa, null);
});

test('cancelar a revisão não grava nada', async () => {
  const sombra = preparar();
  const promessa = NV.painel.revisarClassificacaoDoLote(itens(), OPCOES);
  const sobre = sombra.querySelector('.sobreposicao');

  sobre.querySelector('[data-cancelar]').click();
  assert.equal(await promessa, null);
  assert.equal(sombra.querySelector('.sobreposicao'), null);
});
