/*
 * Classificação integrada ao fechamento: o serviço sai da descrição da requisição,
 * usando a lista real de serviços da produção.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarModulos, montarApp, modalAberto } from './ajuda/ambiente.mjs';

const NV = await carregarModulos();
const SERVICOS = NV.classificar.SERVICOS_CONHECIDOS;

function configurarPadrao(extra) {
  NV.config.restaurarPadrao();
  NV.config.aplicar(
    Object.assign(
      {
        tempos: { elemento: 800, modal: 800, salvar: 800, fechar: 800, intervalo: 15 },
        cacheServicos: { valores: [], atualizadoEm: null }
      },
      extra || {}
    )
  );
}

function presetAutomatico(extra) {
  const preset = Object.assign(
    {
      id: 'auto-teste',
      nome: 'Automático (teste)',
      ocorrencia: 'SUPORTE - TI',
      servico: 'CONFIGURAÇÃO DE EQUIPAMENTOS',
      servicoAutomatico: true,
      causa: '',
      local: 'interno',
      observacao: '',
      datas: { modo: 'agora', duracaoMin: 1 }
    },
    extra || {}
  );
  NV.config.salvarPreset(preset);
  NV.config.definirPresetAtivo(preset.id);
  return preset;
}

test('lê a descrição da requisição na tela', async () => {
  configurarPadrao();
  montarApp({ descricao: 'impressora do 7 andar nao imprime' });

  const descricao = NV.localizar.descricaoDaRequisicao();

  assert.equal(descricao, 'impressora do 7 andar nao imprime');
});

test('não confunde a descrição com número, requisitante ou rótulo', async () => {
  configurarPadrao();
  montarApp({ descricao: 'trocar o toner da impressora da recepcao' });

  const descricao = NV.localizar.descricaoDaRequisicao();

  assert.equal(descricao, 'trocar o toner da impressora da recepcao');
});

test('escolhe o serviço pela descrição e fecha a OS', async () => {
  configurarPadrao();
  presetAutomatico();
  const app = montarApp({ descricao: 'computador da enfermagem nao esta ligando', opcoesServico: SERVICOS });

  const resultado = await NV.fluxo.fecharOS({ agora: new Date(2026, 7, 28, 9, 19) });

  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.equal(app.estado.ocorrencias[0].servico, 'LIGAR EQUIPAMENTO');
  assert.equal(app.estado.fechada, true);

  const passo = resultado.passos.find((p) => /Classificar serviço/.test(p.passo));
  assert.equal(passo.resultado.origem, 'regra');
  assert.equal(passo.resultado.servico, 'LIGAR EQUIPAMENTO');
});

test('classifica outra descrição para outro serviço', async () => {
  configurarPadrao();
  presetAutomatico();
  const app = montarApp({ descricao: 'notebook do faturamento sem acesso a rede', opcoesServico: SERVICOS });

  await NV.fluxo.fecharOS({});

  assert.equal(app.estado.ocorrencias[0].servico, 'EQUIPAMENTO SEM ACESSO A REDE/INTERNET');
});

test('guarda a lista de serviços em cache para não reabrir o combo', async () => {
  configurarPadrao();
  presetAutomatico();
  montarApp({ descricao: 'trocar o toner da impressora', opcoesServico: SERVICOS });

  assert.equal(NV.config.servicosEmCache().length, 0);
  await NV.fluxo.fecharOS({});
  assert.equal(NV.config.servicosEmCache().length, SERVICOS.length, 'a lista lida deveria ficar em cache');

  /* Segunda execução usa o cache. */
  const app2 = montarApp({ descricao: 'trocar o toner da impressora', opcoesServico: SERVICOS });
  const segundo = await NV.fluxo.fecharOS({});
  const passo = segundo.passos.find((p) => /Classificar serviço/.test(p.passo));
  assert.equal(passo.resultado.servico, 'SUBSTITUIÇÃO DE TONNER/CILINDRO');
  assert.equal(app2.estado.ocorrencias[0].servico, 'SUBSTITUIÇÃO DE TONNER/CILINDRO');
});

test('confiança intermediária pergunta ao usuário', async () => {
  configurarPadrao();
  presetAutomatico();
  const app = montarApp({ descricao: 'equipamento com problema na sala 12', opcoesServico: SERVICOS });

  let perguntou = null;
  const resultado = await NV.fluxo.fecharOS({
    aoEscolherServico: async function (info) {
      perguntou = info;
      return 'CHECAGEM E VALIDAÇÃO DE EQUIPAMENTOS';
    }
  });

  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.ok(perguntou, 'deveria ter perguntado por causa da confiança intermediária');
  assert.equal(perguntou.sugestao.origem, 'similaridade');
  assert.ok(perguntou.sugestao.confianca < 0.9, 'confiança deveria ser intermediária');
  assert.ok(perguntou.sugestao.alternativas.length >= 2, 'deveria oferecer alternativas');
  assert.equal(app.estado.ocorrencias[0].servico, 'CHECAGEM E VALIDAÇÃO DE EQUIPAMENTOS');
});

test('não pergunta quando a regra dá confiança alta', async () => {
  configurarPadrao();
  presetAutomatico();
  montarApp({ descricao: 'impressora nao imprime', opcoesServico: SERVICOS });

  let perguntou = false;
  await NV.fluxo.fecharOS({
    aoEscolherServico: async function () {
      perguntou = true;
      return null;
    }
  });

  assert.equal(perguntou, false, 'regra com 95% não deveria perguntar');
});

test('cancelar a escolha do serviço aborta sem salvar', async () => {
  configurarPadrao();
  presetAutomatico();
  const app = montarApp({ descricao: 'equipamento com problema na sala 12', opcoesServico: SERVICOS });

  const resultado = await NV.fluxo.fecharOS({
    aoEscolherServico: async function () {
      return null;
    }
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.cancelado, true);
  assert.equal(app.estado.ocorrencias.length, 0);
  const modal = modalAberto();
  if (modal) modal.remove();
});

test('sem classificação confiável usa o serviço do preset como reserva', async () => {
  configurarPadrao();
  presetAutomatico();
  const app = montarApp({ descricao: 'bom dia, obrigado', opcoesServico: SERVICOS });

  const resultado = await NV.fluxo.fecharOS({});

  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.equal(app.estado.ocorrencias[0].servico, 'CONFIGURAÇÃO DE EQUIPAMENTOS');
  const passo = resultado.passos.find((p) => /Classificar serviço/.test(p.passo));
  assert.equal(passo.resultado.origem, 'preset');
});

test('sem reserva e sem classificação, aborta em vez de chutar', async () => {
  configurarPadrao({ classificacao: { reservaDoPreset: false } });
  presetAutomatico();
  const app = montarApp({ descricao: 'bom dia, obrigado', opcoesServico: SERVICOS });

  const resultado = await NV.fluxo.fecharOS({});

  assert.equal(resultado.ok, false);
  assert.match(resultado.passo, /Classificar serviço/);
  assert.equal(app.estado.ocorrencias.length, 0);
  const modal = modalAberto();
  if (modal) modal.remove();
});

test('preset com serviço fixo ignora a classificação', async () => {
  configurarPadrao();
  presetAutomatico({ servicoAutomatico: false, servico: 'CONFIGURAÇÃO DE SOFTWARE' });
  const app = montarApp({ descricao: 'computador nao esta ligando', opcoesServico: SERVICOS });

  const resultado = await NV.fluxo.fecharOS({});

  assert.equal(resultado.ok, true);
  assert.equal(app.estado.ocorrencias[0].servico, 'CONFIGURAÇÃO DE SOFTWARE');
  assert.equal(
    resultado.passos.some((p) => /Classificar serviço/.test(p.passo)),
    false
  );
});

test('levantamento mostra a descrição e a classificação prevista', async () => {
  configurarPadrao();
  presetAutomatico();
  montarApp({ descricao: 'sem internet no consultorio 3', opcoesServico: SERVICOS });

  const rel = await NV.fluxo.levantamento({});

  assert.equal(rel.descricao, 'sem internet no consultorio 3');
  assert.equal(rel.classificacao.escolhido, 'EQUIPAMENTO SEM ACESSO A REDE/INTERNET');
  assert.match(NV.diagnostico.resumoTexto(rel), /Classificação: EQUIPAMENTO SEM ACESSO A REDE\/INTERNET/);
});

test('as datas ficam com exatamente 1 minuto de diferença', async () => {
  configurarPadrao();
  presetAutomatico({ datas: { modo: 'agora', duracaoMin: 1 } });
  const app = montarApp({ opcoesServico: SERVICOS });

  await NV.fluxo.fecharOS({ agora: new Date(2026, 7, 28, 15, 30, 45) });

  const o = app.estado.ocorrencias[0];
  assert.equal(o.inicio, '28/08/2026, 15:29');
  assert.equal(o.fim, '28/08/2026, 15:30');
  const inicio = NV.dates.parse(o.inicio);
  const fim = NV.dates.parse(o.fim);
  assert.equal(fim.getTime() - inicio.getTime(), 60000, 'exatamente 60 segundos');
});
