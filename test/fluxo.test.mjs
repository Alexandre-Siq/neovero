import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp, modalAberto, valorDoCampo } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();

function configurarPadrao(extra) {
  NV.config.restaurarPadrao();
  NV.config.aplicar(
    Object.assign(
      {
        presetAtivo: 'ti-configuracao',
        tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 },
        lote: { esperaEntreOs: 10 }
      },
      extra || {}
    )
  );
}

test('fecha o chamado de ponta a ponta: ocorrência, salvar e fechar OS', async () => {
  configurarPadrao();
  const app = montarApp();

  const resultado = await NV.fluxo.fecharOS({ agora: new Date(2026, 7, 28, 9, 19) });

  assert.equal(resultado.ok, true, 'esperava sucesso, veio: ' + JSON.stringify(resultado, null, 2));
  assert.equal(resultado.numeroOs, '202602691');
  assert.equal(resultado.fechada, true);
  assert.equal(app.estado.fechada, true, 'a OS deveria ter sido encerrada no app falso');
  assert.equal(app.estado.ocorrencias.length, 1);

  const lancada = app.estado.ocorrencias[0];
  assert.equal(lancada.ocorrencia, 'SUPORTE - TI');
  assert.equal(lancada.servico, 'CONFIGURAÇÃO DE EQUIPAMENTOS');
  assert.equal(lancada.inicio, '28/08/2026, 09:18');
  assert.equal(lancada.fim, '28/08/2026, 09:19');
  assert.equal(lancada.interno, true);
  assert.equal(modalAberto(), null, 'o modal deveria ter fechado');
});

test('clica em "Iniciar Atendimento" quando ele está visível', async () => {
  configurarPadrao();
  const app = montarApp();
  await NV.fluxo.fecharOS({});
  assert.equal(app.estado.atendimentoIniciado, true);
});

test('não tenta iniciar atendimento quando o botão não está na tela', async () => {
  configurarPadrao();
  const app = montarApp({ comAtendimentoIniciado: true });
  const resultado = await NV.fluxo.fecharOS({});
  assert.equal(resultado.ok, true);
  assert.equal(app.estado.atendimentoIniciado, false, 'não deveria ter clicado em "Iniciar Atendimento"');
});

test('simulação preenche o modal e para antes de salvar', async () => {
  configurarPadrao();
  const app = montarApp();

  const resultado = await NV.fluxo.fecharOS({ execucaoSeca: true, agora: new Date(2026, 7, 28, 14, 30) });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.execucaoSeca, true);
  assert.ok(modalAberto(), 'o modal deve continuar aberto para conferência');
  assert.equal(valorDoCampo('ocorrencia'), 'SUPORTE - TI');
  assert.equal(valorDoCampo('servico'), 'CONFIGURAÇÃO DE EQUIPAMENTOS');
  assert.equal(valorDoCampo('dataOcorrencia'), '28/08/2026, 14:29');
  assert.equal(valorDoCampo('dataFinal'), '28/08/2026, 14:30');
  assert.equal(app.estado.ocorrencias.length, 0, 'nada deve ser salvo na simulação');
  assert.equal(app.estado.fechada, false);
});

test('preset com observação e causa preenche os campos opcionais', async () => {
  configurarPadrao();
  const app = montarApp();
  NV.config.salvarPreset({
    id: 'completo',
    nome: 'Completo',
    ocorrencia: 'SUPORTE - TI',
    servico: 'CONFIGURAÇÃO DE SOFTWARE',
    causa: 'ERRO DE CONFIGURAÇÃO',
    local: 'externo',
    observacao: 'Ponto de rede reconfigurado.',
    datas: { modo: 'inicioAgora', duracaoMin: 15 }
  });
  NV.config.definirPresetAtivo('completo');

  const resultado = await NV.fluxo.fecharOS({ agora: new Date(2026, 7, 28, 8, 0) });

  assert.equal(resultado.ok, true, JSON.stringify(resultado.passos, null, 2));
  const o = app.estado.ocorrencias[0];
  assert.equal(o.servico, 'CONFIGURAÇÃO DE SOFTWARE');
  assert.equal(o.causa, 'ERRO DE CONFIGURAÇÃO');
  assert.equal(o.observacao, 'Ponto de rede reconfigurado.');
  assert.equal(o.interno, false, 'deveria ter marcado Externo');
  assert.equal(o.inicio, '28/08/2026, 08:00');
  assert.equal(o.fim, '28/08/2026, 08:15');
});

test('usa a data de abertura da OS quando o preset pede', async () => {
  configurarPadrao();
  const app = montarApp({ abertura: '14/08/2026 09:51' });
  NV.config.salvarPreset({
    id: 'desde-abertura',
    nome: 'Desde a abertura',
    ocorrencia: 'SUPORTE - TI',
    servico: 'CONFIGURAÇÃO DE EQUIPAMENTOS',
    causa: '',
    local: 'interno',
    observacao: '',
    datas: { modo: 'abertura', duracaoMin: 1 }
  });
  NV.config.definirPresetAtivo('desde-abertura');

  await NV.fluxo.fecharOS({ agora: new Date(2026, 7, 28, 9, 19) });

  assert.equal(app.estado.ocorrencias[0].inicio, '14/08/2026, 09:51');
  assert.equal(app.estado.ocorrencias[0].fim, '28/08/2026, 09:19');
});

test('falha com erro claro quando o serviço do preset não existe no combo', async () => {
  configurarPadrao();
  const app = montarApp({ opcoesServico: ['TROCA DE TONER', 'INSTALAÇÃO DE SOFTWARE'] });

  const resultado = await NV.fluxo.fecharOS({});

  assert.equal(resultado.ok, false);
  assert.match(resultado.passo, /Selecionar serviço/);
  assert.match(resultado.erro, /Opção não encontrada/);
  assert.equal(app.estado.ocorrencias.length, 0, 'não deve salvar ocorrência incompleta');
  assert.equal(app.estado.fechada, false, 'não deve fechar a OS');

  const passoServico = resultado.passos.find((p) => /Selecionar serviço/.test(p.passo));
  assert.deepEqual(passoServico.detalhes.disponiveis, ['TROCA DE TONER', 'INSTALAÇÃO DE SOFTWARE']);
});

test('falha quando não há OS aberta na tela', async () => {
  configurarPadrao();
  montarApp();
  document.querySelector('.janela-os').remove();

  const resultado = await NV.fluxo.fecharOS({});

  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /Ordem de Serviço não encontrada|Botão "Ocorrência" não encontrado/);
});

test('respeita "apenasOcorrencia": lança a ocorrência sem fechar a OS', async () => {
  configurarPadrao();
  const app = montarApp();

  const resultado = await NV.fluxo.fecharOS({ apenasOcorrencia: true });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.fechada, false);
  assert.equal(app.estado.ocorrencias.length, 1);
  assert.equal(app.estado.fechada, false);
});

test('pede confirmação antes de fechar e respeita a recusa', async () => {
  configurarPadrao();
  const app = montarApp();
  let perguntou = 0;

  const resultado = await NV.fluxo.fecharOS({
    aoConfirmar: async function () {
      perguntou += 1;
      return false;
    }
  });

  assert.equal(perguntou, 1);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.fechada, false);
  assert.equal(app.estado.ocorrencias.length, 1, 'a ocorrência já estava lançada');
  assert.equal(app.estado.fechada, false);
});

test('encontra o botão "Fechar OS" pelo seletor calibrado quando não há tooltip', async () => {
  configurarPadrao();
  const app = montarApp({ semTooltipFecharOs: true });

  const semCalibragem = await NV.fluxo.fecharOS({});
  assert.equal(semCalibragem.ok, false);
  assert.match(semCalibragem.erro, /Fechar OS/);
  assert.equal(app.estado.ocorrencias.length, 1, 'a ocorrência foi lançada antes de falhar');

  NV.config.definirSeletor('botaoFecharOs', 'button.icone-fechar');
  const app2 = montarApp({ semTooltipFecharOs: true });
  const comCalibragem = await NV.fluxo.fecharOS({});
  assert.equal(comCalibragem.ok, true, JSON.stringify(comCalibragem, null, 2));
  assert.equal(app2.estado.fechada, true);
});

test('cancelamento interrompe o fluxo', async () => {
  configurarPadrao();
  const app = montarApp();
  const sinal = NV.fluxo.criarSinal();
  sinal.cancelar();

  const resultado = await NV.fluxo.fecharOS({ sinal: sinal });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.cancelado, true);
  assert.equal(app.estado.ocorrencias.length, 0);
});

test('modo lote fecha várias OS da lista do monitor', async () => {
  configurarPadrao();
  const app = montarApp({ listaOs: ['202602691', '202602690', '202602688'] });

  const resumo = await NV.lote.fechar({ numeros: ['202602690', '202602688'] });

  assert.equal(resumo.total, 2);
  assert.equal(resumo.sucesso, 2, JSON.stringify(resumo.falhas, null, 2));
  assert.equal(app.estado.fechada, true);
});

test('lote respeita o limite máximo configurado', async () => {
  configurarPadrao({ lote: { maximo: 1, esperaEntreOs: 10 } });
  montarApp({ listaOs: ['202602691', '202602690'] });

  const resumo = await NV.lote.fechar({ numeros: ['202602691', '202602690'] });

  assert.equal(resumo.total, 1);
  assert.equal(resumo.processadas, 1);
});
