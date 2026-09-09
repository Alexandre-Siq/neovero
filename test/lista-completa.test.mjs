/*
 * Regressão: o combo "Serviço" do Neovero é uma lista rolável que renderiza só a
 * janela visível. Sem rolar até o fim, a leitura trazia apenas os primeiros itens
 * (todos começando com A, B, C) e a classificação usava meia lista.
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
        presetAtivo: 'ti-automatico',
        tempos: { elemento: 1500, modal: 1500, salvar: 1500, fechar: 1500, intervalo: 10 },
        cacheServicos: { valores: [], atualizadoEm: null }
      },
      extra || {}
    )
  );
}

async function abrirModal() {
  const janela = NV.localizar.janelaOs();
  return NV.fluxo.abrirModalOcorrencia(janela, NV.config.obter().tempos);
}

test('a réplica virtual mostra só uma fatia da lista (reproduz o problema)', async () => {
  configurarPadrao();
  montarApp({ servicoVirtual: true, opcoesServico: SERVICOS });
  const modal = await abrirModal();

  const el = NV.localizar.campoServico(modal);
  const aberto = await NV.campos.abrirPainel(el, { rotulo: 'Serviço' });
  const visiveis = NV.campos.opcoesDe(aberto.painel).map((o) => o.texto);

  assert.ok(visiveis.length < 20, 'a lista virtual deveria renderizar poucos itens: ' + visiveis.length);
  assert.equal(visiveis[0], SERVICOS[0]);
  assert.ok(!visiveis.includes('LIGAR EQUIPAMENTO'), 'itens do fim da lista não estão renderizados');

  await NV.campos.garantirPainelFechado(el, aberto.painel);
  modal.remove();
});

test('rolando o painel, lê a lista inteira e na ordem', async () => {
  configurarPadrao();
  montarApp({ servicoVirtual: true, opcoesServico: SERVICOS });
  const modal = await abrirModal();

  const opcoes = await NV.campos.listarOpcoes(NV.localizar.campoServico(modal), { rotulo: 'Serviço' });

  assert.equal(opcoes.length, SERVICOS.length, 'deveria ler todos os serviços');
  assert.deepEqual(opcoes, SERVICOS, 'na mesma ordem da lista');
  modal.remove();
});

test('classifica usando serviços que só existem no fim da lista', async () => {
  configurarPadrao();
  const app = montarApp({
    servicoVirtual: true,
    opcoesServico: SERVICOS,
    descricao: 'computador da enfermagem nao esta ligando'
  });

  const resultado = await NV.fluxo.fecharOS({ agora: new Date(2026, 8, 9, 11, 0) });

  assert.equal(resultado.ok, true, JSON.stringify(resultado, null, 2));
  assert.equal(
    app.estado.ocorrencias[0].servico,
    'LIGAR EQUIPAMENTO',
    'sem ler a lista inteira, esse serviço nunca seria escolhido'
  );
  assert.equal(NV.config.servicosEmCache().length, SERVICOS.length);
});

test('"Conferir tela" lê a lista completa da versão virtual', async () => {
  configurarPadrao();
  montarApp({ servicoVirtual: true, opcoesServico: SERVICOS, descricao: 'trocar o toner da impressora' });

  const rel = await NV.fluxo.levantamento({});

  assert.equal(rel.opcoes.servico.length, SERVICOS.length);
  assert.equal(rel.servicosLidos, SERVICOS.length);
  assert.equal(rel.baseDaClassificacao, SERVICOS.length);
  assert.equal(rel.classificacao.escolhido, 'SUBSTITUIÇÃO DE TONNER/CILINDRO');
  assert.deepEqual(rel.problemas, []);
  assert.equal(modalAberto(), null);
});

test('leitura curta é completada com a lista de referência e avisada', async () => {
  configurarPadrao();
  const curta = SERVICOS.slice(0, 10);
  montarApp({ opcoesServico: curta });
  const modal = await abrirModal();

  const saida = await NV.fluxo.opcoesDeServico(modal, { forcarLeitura: true });

  assert.equal(saida.lidos, 10);
  assert.equal(saida.parcial, true);
  assert.equal(saida.opcoes.length, SERVICOS.length, 'completou com a referência');
  assert.ok(
    NV.log.entradas().some((e) => /parece incompleta/.test(e.mensagem)),
    'deveria registrar o aviso no log'
  );

  const cancelar = NV.dom.acharBotao(modal, ['Cancelar'], { min: 0.98 });
  if (cancelar) NV.dom.clicar(cancelar);
});

test('lista completa não é alterada pela rede de segurança', async () => {
  configurarPadrao();
  montarApp({ opcoesServico: SERVICOS });
  const modal = await abrirModal();

  const saida = await NV.fluxo.opcoesDeServico(modal, { forcarLeitura: true });

  assert.equal(saida.parcial, false);
  assert.equal(saida.opcoes.length, SERVICOS.length);

  const cancelar = NV.dom.acharBotao(modal, ['Cancelar'], { min: 0.98 });
  if (cancelar) NV.dom.clicar(cancelar);
});

test('o painel volta ao topo depois de ler a lista', async () => {
  configurarPadrao();
  montarApp({ servicoVirtual: true, opcoesServico: SERVICOS });
  const modal = await abrirModal();
  const el = NV.localizar.campoServico(modal);

  const aberto = await NV.campos.abrirPainel(el, { rotulo: 'Serviço' });
  await NV.campos.coletarTodasAsOpcoes(aberto.painel);

  assert.equal(aberto.painel.scrollTop, 0, 'deve devolver a rolagem para onde estava');
  await NV.campos.garantirPainelFechado(el, aberto.painel);
  modal.remove();
});
