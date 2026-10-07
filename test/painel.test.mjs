/*
 * Regressão: o painel registra um atalho global de Esc para cancelar a execução.
 * O próprio fluxo dispara Esc para fechar calendário/lista flutuante — esses eventos
 * sintéticos não podem cancelar a execução (foi o que quebrou o fluxo no navegador real).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();
await import('../src/ui/estilos.js');
await import('../src/ui/aprender.js');
await import('../src/ui/lista.js');
await import('../src/ui/painel.js');

test('painel montado não cancela o fluxo com o Esc que o próprio script dispara', async () => {
  NV.config.restaurarPadrao();
  NV.config.aplicar({
    presetAtivo: 'ti-configuracao',
    tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 }
  });
  const app = montarApp();
  NV.painel.montar();

  const resultado = await NV.fluxo.fecharOS({ agora: new Date(2026, 7, 28, 9, 19) });

  assert.equal(resultado.cancelado, undefined, 'não deveria ter sido cancelado');
  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.equal(app.estado.ocorrencias.length, 1);
  assert.equal(app.estado.ocorrencias[0].fim, '28/08/2026, 09:19');
  assert.equal(app.estado.fechada, true);
});

test('remonta o painel se a aplicação limpar a página', () => {
  montarApp();
  NV.painel.montar();
  assert.equal(NV.painel.montado(), true);

  /* SPA trocando o conteúdo da página leva o painel embora. */
  document.querySelector('[data-nv-ui="painel"]').remove();
  assert.equal(NV.painel.montado(), false);

  NV.painel.montar();
  assert.equal(NV.painel.montado(), true);
});

test('o painel não é enxergado como parte da aplicação', () => {
  const elementos = NV.dom.elementos(document);
  const doPainel = elementos.filter((el) => el.closest && el.closest('[data-nv-ui]'));
  assert.equal(doPainel.length, 0, 'elementos do painel devem ser ignorados na busca');
});

test('atalhos disparados por script são ignorados', async () => {
  NV.config.restaurarPadrao();
  montarApp();
  NV.painel.montar();
  const status = document.querySelector('[data-nv-ui="painel"]').shadowRoot.querySelector('.status');
  status.textContent = 'inalterado';

  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', altKey: true, bubbles: true }));
  await NV.async.sleep(120);

  assert.equal(status.textContent, 'inalterado', 'Alt+F sintético não deveria iniciar execução');
});
