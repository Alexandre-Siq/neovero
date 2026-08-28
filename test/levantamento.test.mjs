/*
 * "Conferir tela": levantamento só de leitura, usado como primeiro passo em produção.
 * Precisa listar o que foi encontrado, as opções reais dos combos e comparar com o preset,
 * sem salvar nada e devolvendo o modal fechado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp, montarAppEmFrame, modalAberto } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();

function configurarPadrao() {
  NV.config.restaurarPadrao();
  NV.config.aplicar({ tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 } });
}

function item(relatorio, chave) {
  return relatorio.elementos.find((e) => e.chave === chave);
}

test('encontra todos os elementos do fluxo e não deixa resíduo', async () => {
  configurarPadrao();
  const app = montarApp();

  const rel = await NV.fluxo.levantamento({});

  assert.equal(rel.numeroOs, '202602691');
  assert.equal(rel.aberturaOs, '14/08/2026, 09:51');
  assert.equal(rel.modalAberto, true);
  assert.equal(rel.modalFechado, true, 'o modal deve ser fechado com Cancelar');
  assert.equal(modalAberto(), null);
  assert.equal(app.estado.ocorrencias.length, 0, 'levantamento não salva nada');
  assert.equal(app.estado.fechada, false);
  assert.equal(app.estado.atendimentoIniciado, false, 'não deve iniciar atendimento');

  ['janelaOs', 'botaoOcorrencia', 'botaoFecharOs', 'campoOcorrencia', 'campoDataOcorrencia', 'campoDataFinal', 'campoServico', 'botaoSalvarModal'].forEach(
    function (chave) {
      assert.equal(item(rel, chave).encontrado, true, chave + ' deveria ter sido encontrado');
    }
  );
  assert.deepEqual(rel.problemas, []);
});

test('lista as opções reais de cada combo', async () => {
  configurarPadrao();
  montarApp();

  const rel = await NV.fluxo.levantamento({});

  assert.deepEqual(rel.opcoes.ocorrencia, ['SUPORTE - TI', 'MANUTENÇÃO PREDIAL', 'HIGIENIZAÇÃO']);
  assert.deepEqual(rel.opcoes.servico, ['CONFIGURAÇÃO DE EQUIPAMENTOS', 'CONFIGURAÇÃO DE REDE', 'TROCA DE PEÇA']);
  assert.ok(rel.opcoes.causa.includes('FALHA DE HARDWARE'), 'combo nativo também deve ser lido');
});

/* Regressão: as listas flutuantes ficavam abertas na tela depois de serem lidas. */
test('não deixa lista de opções aberta na tela', async () => {
  configurarPadrao();
  montarApp();

  const rel = await NV.fluxo.levantamento({});

  assert.equal(document.querySelectorAll('.painel-opcoes').length, 0, 'nenhuma lista deveria continuar aberta');
  assert.deepEqual(rel.problemas, []);
});

test('não deixa lista aberta quando a opção do preset não existe', async () => {
  configurarPadrao();
  montarApp({ opcoesServico: ['TROCA DE TONER'] });

  const resultado = await NV.fluxo.fecharOS({});

  assert.equal(resultado.ok, false);
  assert.equal(document.querySelectorAll('.painel-opcoes').length, 0, 'a lista deveria ter sido fechada antes de abortar');
  const modal = modalAberto();
  if (modal) modal.remove();
});

test('confere o preset contra a produção e sugere o valor parecido', async () => {
  configurarPadrao();
  montarApp({ opcoesServico: ['CONFIGURACAO DE EQUIPAMENTO', 'TROCA DE TONER'] });

  const rel = await NV.fluxo.levantamento({});

  const ocorrencia = rel.conferenciaDoPreset.find((c) => c.campo === 'Ocorrência');
  assert.equal(ocorrencia.situacao, 'exato');

  const servico = rel.conferenciaDoPreset.find((c) => c.campo === 'Serviço');
  assert.equal(servico.situacao, 'aproximado');
  assert.equal(servico.sugestao, 'CONFIGURACAO DE EQUIPAMENTO');
  assert.ok(
    rel.problemas.some((p) => /Serviço do preset/.test(p)),
    'deveria avisar que o serviço do preset não existe exatamente'
  );
});

test('aponta o que falta quando a OS não está aberta', async () => {
  configurarPadrao();
  montarApp();
  document.querySelector('.janela-os').remove();

  const rel = await NV.fluxo.levantamento({});

  assert.equal(item(rel, 'janelaOs').encontrado, false);
  assert.equal(rel.modalAberto, false);
  assert.ok(rel.problemas.length >= 2);
});

test('marca os elementos que estão dentro de iframe', async () => {
  configurarPadrao();
  montarAppEmFrame();

  const rel = await NV.fluxo.levantamento({});

  assert.equal(rel.documentos, 2);
  assert.equal(item(rel, 'campoServico').emFrame, true);
  assert.match(item(rel, 'botaoOcorrencia').seletor, /iframe/);
  assert.equal(rel.modalFechado, true);
});

test('simulação segue até o fim e junta todos os problemas de uma vez', async () => {
  configurarPadrao();
  const app = montarApp({ opcoesServico: ['TROCA DE TONER'] });

  const resultado = await NV.fluxo.fecharOS({ execucaoSeca: true, agora: new Date(2026, 7, 28, 9, 19) });

  assert.equal(resultado.ok, true, 'simulação não aborta por causa de um campo');
  assert.equal(resultado.problemas.length, 1);
  assert.match(resultado.problemas[0].passo, /Selecionar serviço/);
  assert.match(resultado.problemas[0].motivo, /Opção não encontrada/);

  /* Os campos que funcionam continuam preenchidos, para conferência visual. */
  const modal = modalAberto();
  assert.equal(modal.querySelector('[data-campo="dataOcorrencia"]').value, '28/08/2026, 09:18');
  assert.equal(modal.querySelector('[data-campo="dataFinal"]').value, '28/08/2026, 09:19');
  assert.equal(modal.querySelector('[data-combo="ocorrencia"]').textContent, 'SUPORTE - TI');
  assert.equal(app.estado.ocorrencias.length, 0);
  modal.remove();
});

test('simulação não inicia o atendimento (sem efeito colateral)', async () => {
  configurarPadrao();
  const app = montarApp();

  await NV.fluxo.fecharOS({ execucaoSeca: true });

  assert.equal(app.estado.atendimentoIniciado, false, 'simular não deve alterar o estado da OS');
  const modal = modalAberto();
  if (modal) modal.remove();
});

test('resumo em texto traz elementos, opções e problemas', async () => {
  configurarPadrao();
  montarApp({ opcoesServico: ['TROCA DE TONER'] });

  const rel = await NV.fluxo.levantamento({});
  const texto = NV.diagnostico ? NV.diagnostico.resumoTexto(rel) : null;
  assert.ok(texto, 'diagnostico.resumoTexto deveria existir');
  assert.match(texto, /Conferir tela/);
  assert.match(texto, /OS em foco: 202602691/);
  assert.match(texto, /SUPORTE - TI/);
  assert.match(texto, /TROCA DE TONER/);
  assert.match(texto, /-- Problemas --/);
});
