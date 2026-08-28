/*
 * O Neovero roda em https://ishaoc.neovero.com/UI/Base/Menu.aspx#/ — aplicação ASP.NET
 * com janelas MDI, padrão em que cada janela costuma ser um iframe de mesma origem.
 * Estes testes garantem que o fluxo funciona com a OS dentro de um frame.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarAppEmFrame, modalAberto } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();

function configurarPadrao() {
  NV.config.restaurarPadrao();
  NV.config.aplicar({ tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 } });
}

test('a busca de elementos atravessa iframes de mesma origem', () => {
  configurarPadrao();
  montarAppEmFrame();

  const docs = NV.dom.documentos();
  assert.equal(docs.length, 2, 'documento do topo + documento do iframe');

  const janela = NV.localizar.janelaOs();
  assert.notEqual(janela, document.body);
  assert.equal(NV.localizar.numeroOs(janela), '202602691');
});

test('fecha o chamado com a janela da OS dentro de um iframe', async () => {
  configurarPadrao();
  const app = montarAppEmFrame();

  const resultado = await NV.fluxo.fecharOS({ agora: new Date(2026, 7, 28, 9, 19) });

  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.equal(resultado.fechada, true);
  assert.equal(app.estado.fechada, true);
  assert.equal(app.estado.ocorrencias.length, 1);
  assert.equal(app.estado.ocorrencias[0].servico, 'CONFIGURAÇÃO DE EQUIPAMENTOS');
  assert.equal(app.estado.ocorrencias[0].inicio, '28/08/2026, 09:18');
  assert.equal(modalAberto(), null);
});

test('seletor calibrado guarda o caminho do frame e volta a resolver', async () => {
  configurarPadrao();
  const app = montarAppEmFrame({ semTooltipFecharOs: true });

  const botao = app.doc.querySelector('button.icone-fechar');
  const caminho = NV.dom.caminhoCss(botao);
  assert.match(caminho, /iframe/, 'o caminho precisa incluir o iframe');
  assert.match(caminho, / >>> /);
  assert.equal(NV.dom.porCaminhoCss(caminho), botao, 'deve resolver de volta o mesmo elemento');

  NV.config.definirSeletor('botaoFecharOs', caminho);
  const resultado = await NV.fluxo.fecharOS({});
  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.equal(app.estado.fechada, true);
});

test('escreve em campos dentro do iframe apesar de outro realm de JS', async () => {
  configurarPadrao();
  const app = montarAppEmFrame();

  const resultado = await NV.fluxo.fecharOS({ execucaoSeca: true, agora: new Date(2026, 7, 28, 16, 45) });

  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  const modal = modalAberto();
  assert.ok(modal, 'modal deveria seguir aberto na simulação');
  assert.equal(modal.ownerDocument, app.doc, 'o modal está no documento do iframe');
  assert.equal(modal.querySelector('[data-campo="dataOcorrencia"]').value, '28/08/2026, 16:44');
  assert.equal(modal.querySelector('[data-campo="dataFinal"]').value, '28/08/2026, 16:45');
  assert.equal(modal.querySelector('[data-combo="servico"]').textContent, 'CONFIGURAÇÃO DE EQUIPAMENTOS');
});
