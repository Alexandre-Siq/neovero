import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/util/text.js');
await import('../src/util/dates.js');
await import('../src/util/async.js');
await import('../src/core/log.js');
await import('../src/core/config.js');
const { config } = globalThis.NV;

test('carrega os padrões com os presets de fábrica', () => {
  const cfg = config.carregar();
  assert.equal(cfg.presetAtivo, 'ti-automatico');
  assert.ok(cfg.presets.length >= 1);
  assert.equal(config.presetAtivo().ocorrencia, 'SUPORTE - TI');
});

test('mesclar ignora valores com tipo incompatível', () => {
  const mesclado = config.mesclar(config.PADRAO, { tempos: 'errado', confirmarAntesDeFechar: false });
  assert.equal(mesclado.tempos.modal, config.PADRAO.tempos.modal);
  assert.equal(mesclado.confirmarAntesDeFechar, false);
});

test('mesclar preserva chaves extras salvas pelo usuário', () => {
  const mesclado = config.mesclar(config.PADRAO, { seletores: { botaoFecharOs: 'div#x' } });
  assert.equal(mesclado.seletores.botaoFecharOs, 'div#x');
});

test('validarPreset aponta campos obrigatórios', () => {
  const erros = config.validarPreset({ nome: '', ocorrencia: '', servico: '' });
  assert.equal(erros.length, 3);
  assert.equal(config.validarPreset({ nome: 'x', ocorrencia: 'a', servico: 'b', datas: { modo: 'agora', duracaoMin: 5 } }).length, 0);
});

test('validarPreset rejeita duração e modo fora do domínio', () => {
  const erros = config.validarPreset({ nome: 'x', ocorrencia: 'a', servico: 'b', datas: { modo: 'ontem', duracaoMin: 5000 } });
  assert.equal(erros.length, 2);
});

test('CRUD de presets mantém o preset ativo consistente', () => {
  config.restaurarPadrao();
  const novo = { id: 'teste-1', nome: 'Teste', ocorrencia: 'A', servico: 'B', datas: { modo: 'agora', duracaoMin: 2 } };
  config.salvarPreset(novo);
  assert.equal(config.obter().presets.length, 4);

  config.definirPresetAtivo('teste-1');
  assert.equal(config.presetAtivo().nome, 'Teste');

  config.salvarPreset(Object.assign({}, novo, { nome: 'Teste editado' }));
  assert.equal(config.obter().presets.length, 4);
  assert.equal(config.presetAtivo().nome, 'Teste editado');

  config.removerPreset('teste-1');
  assert.equal(config.obter().presets.length, 3);
  assert.notEqual(config.obter().presetAtivo, 'teste-1');
});

test('seletores calibrados são gravados e limpos', () => {
  config.restaurarPadrao();
  config.definirSeletor('botaoFecharOs', 'div.toolbar > button:nth-of-type(2)');
  assert.equal(config.seletor('botaoFecharOs'), 'div.toolbar > button:nth-of-type(2)');
  config.definirSeletor('botaoFecharOs', null);
  assert.equal(config.seletor('botaoFecharOs'), null);
});

test('migração acrescenta presets novos a uma configuração antiga', () => {
  const antiga = {
    presetAtivo: 'ti-configuracao',
    presets: [
      {
        id: 'ti-configuracao',
        nome: 'Meu preset editado',
        ocorrencia: 'SUPORTE - TI',
        servico: 'CONFIGURAÇÃO DE EQUIPAMENTOS',
        causa: '',
        local: 'interno',
        observacao: '',
        datas: { modo: 'agora', duracaoMin: 1 }
      }
    ],
    seletores: { botaoFecharOs: 'button.icone-fechar' }
  };

  const migrada = config.aplicarMigracoes(config.mesclar(config.PADRAO, antiga));

  assert.equal(migrada.presets.length, 3, 'os presets de fábrica que faltavam devem ser acrescentados');
  assert.equal(migrada.presets[0].nome, 'Meu preset editado', 'a edição do usuário é preservada');
  assert.ok(
    migrada.presets.some((p) => p.id === 'ti-automatico' && p.servicoAutomatico),
    'o preset de classificação automática deve aparecer'
  );
  assert.equal(migrada.presetAtivo, 'ti-configuracao', 'o preset ativo do usuário é mantido');
  assert.equal(migrada.seletores.botaoFecharOs, 'button.icone-fechar', 'a calibração é preservada');
});

test('migração não roda duas vezes', () => {
  const cfg = config.aplicarMigracoes(config.mesclar(config.PADRAO, { presets: [], migracoes: [] }));
  const quantidade = cfg.presets.length;
  cfg.presets = cfg.presets.filter((p) => p.id !== 'ti-automatico');
  const novamente = config.aplicarMigracoes(cfg);
  assert.equal(novamente.presets.length, quantidade - 1, 'preset apagado pelo usuário não deve voltar');
});

test('gerarId produz slug estável e único', () => {
  const a = config.gerarId('TI — Configuração de Equipamentos');
  assert.match(a, /^ti-configuracao-de-equipamentos-[a-z0-9]{4}$/);
  assert.notEqual(a, config.gerarId('TI — Configuração de Equipamentos'));
});
