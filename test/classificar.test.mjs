/*
 * Classificação do Serviço a partir da descrição da requisição.
 * A lista de serviços usada aqui é a observada na produção (ishaoc).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/util/text.js');
await import('../src/core/classificar.js');
const { classificar } = globalThis.NV;

const SERVICOS = classificar.SERVICOS_CONHECIDOS;

function sugerir(descricao, opcoes) {
  return classificar.sugerir(descricao, opcoes || SERVICOS, { regras: classificar.REGRAS_PADRAO });
}

test('radical aproxima formas verbais e plurais', () => {
  assert.equal(classificar.raiz('ligando'), classificar.raiz('ligar'));
  assert.equal(classificar.raiz('impressoras'), classificar.raiz('impressora'));
  assert.equal(classificar.raiz('configuração'), classificar.raiz('configurar'));
  assert.equal(classificar.raiz('equipamentos'), classificar.raiz('equipamento'));
});

test('palavras irrelevantes são descartadas', () => {
  const palavras = classificar.palavrasRelevantes('Por favor, o computador da enfermagem não está ligando');
  assert.ok(!palavras.includes('de'));
  assert.ok(!palavras.includes('favor'));
  assert.ok(palavras.includes('computador'));
  assert.ok(palavras.includes('nao'));
});

test('caso real: "computador da enfermagem nao esta ligando"', () => {
  const r = sugerir('computador da enfermagem nao esta ligando');
  assert.equal(r.escolhido, 'LIGAR EQUIPAMENTO');
  assert.equal(r.origem, 'regra');
  assert.ok(r.confianca >= 0.9);
});

test('regras cobrem os pedidos mais comuns de TI', () => {
  const casos = [
    ['a impressora do 5º andar não imprime', 'ERRO DE IMPRESSÃO'],
    ['trocar o toner da impressora da recepção', 'SUBSTITUIÇÃO DE TONNER/CILINDRO'],
    ['computador sem internet no almoxarifado', 'EQUIPAMENTO SEM ACESSO A REDE/INTERNET'],
    ['preciso resetar a senha do senior', 'RESET DE SENHA SENIOR'],
    ['favor resetar senha de e-mail da colaboradora', 'RESET DE SENHA DE E-MAIL'],
    ['criar e-mail para novo funcionário', 'CRIAÇÃO DE E-MAIL'],
    ['instalar software de digitalização', 'INSTALAÇÃO DE SOFTWARE OU APP'],
    ['mouse quebrado, precisa trocar', 'TROCA DE PERIFERICOS'],
    ['sistema travando na classificação de risco', 'SERVIÇO TRAVADO'],
    ['liberar acesso a pasta do financeiro no file server', 'LIBERAÇÃO DE PASTA DE SERVIDOR DE ARQUIVOS'],
    ['ramal 2045 sem linha', 'REBOOT EM RAMAL CISCO'],
    ['dúvida de como lançar no MV', 'DUVIDA'],
    ['segunda via de laudo do WTT', 'SEGUNDA VIA DE LAUDO - WTT'],
    ['java bloqueado no navegador', 'LIBERAÇÃO DE JAVA'],
    ['organizar cabeamento da sala de reunião', 'ADEQUAÇÃO DE CABOS']
  ];
  const falhas = [];
  casos.forEach(function (caso) {
    const r = sugerir(caso[0]);
    if (r.escolhido !== caso[1]) falhas.push(caso[0] + ' -> ' + r.escolhido + ' (esperado ' + caso[1] + ')');
  });
  assert.deepEqual(falhas, []);
});

/* Regressão: "risco" casava com a palavra-chave "ris". */
test('palavra-chave curta não casa dentro de outra palavra', () => {
  assert.equal(sugerir('sistema travando na classificação de risco').escolhido, 'SERVIÇO TRAVADO');
  assert.equal(sugerir('erro no ris ao abrir exame').escolhido, 'INSTALAR/CONFIGURAR RIS-PACS');
  assert.equal(sugerir('preciso liberar o java').escolhido, 'LIBERAÇÃO DE JAVA');
  assert.notEqual(sugerir('erro no javascript do site').escolhido, 'LIBERAÇÃO DE JAVA');
});

test('palavra-chave média aceita plural', () => {
  assert.equal(sugerir('trocar os toners da impressora').escolhido, 'SUBSTITUIÇÃO DE TONNER/CILINDRO');
  assert.equal(sugerir('organizar os cabos atrás da mesa').escolhido, 'ADEQUAÇÃO DE CABOS');
});

test('regra específica de equipamento vence a genérica de manutenção', () => {
  assert.equal(sugerir('mouse quebrado, precisa trocar').escolhido, 'TROCA DE PERIFERICOS');
  assert.equal(sugerir('gabinete quebrado').escolhido, 'MANUTENÇÃO DE EQUIPAMENTO');
});

test('sem regra, decide por semelhança de palavras', () => {
  const r = classificar.sugerir('necessário verificação de equipamento na sala 12', SERVICOS, { regras: [] });
  assert.equal(r.origem, 'similaridade');
  assert.equal(r.escolhido, 'VERIFICAÇÃO DE EQUIPAMENTO');
  assert.ok(r.confianca >= 0.5);
});

test('descrição sem relação não escolhe nada e explica', () => {
  const r = classificar.sugerir('bom dia, obrigado', SERVICOS, { regras: [], minimo: 0.5 });
  assert.equal(r.escolhido, null);
  assert.ok(r.avisos.length >= 1);
});

test('descrição vazia é reportada, não adivinhada', () => {
  const r = sugerir('');
  assert.equal(r.escolhido, null);
  assert.match(r.avisos.join(' '), /vazia/);
});

test('sempre devolve alternativas ranqueadas para conferência', () => {
  const r = sugerir('impressora não imprime e está com erro de rede');
  assert.ok(r.alternativas.length >= 2);
  assert.ok(r.alternativas[0].score >= r.alternativas[1].score);
});

test('só sugere serviço que existe na lista da tela', () => {
  const listaCurta = ['CONFIGURAÇÃO DE EQUIPAMENTOS', 'ERRO DE IMPRESSÃO'];
  const r = sugerir('computador nao esta ligando', listaCurta);
  assert.ok(listaCurta.includes(r.escolhido) || r.escolhido === null);
});

/*
 * O nome do serviço na lista varia em pontuação e palavras de ligação
 * ("TONNER/CILINDRO" vs "TONNER E CILINDRO"): a regra tem de casar do mesmo jeito.
 */
test('reconhece o mesmo serviço escrito de outra forma', () => {
  assert.equal(classificar.mesmoServico('SUBSTITUIÇÃO DE TONNER/CILINDRO', 'SUBSTITUICAO DE TONNER E CILINDRO'), true);
  assert.equal(classificar.mesmoServico('SUBSTITUIÇÃO DE TONNER/CILINDRO', 'SUBSTITUICAO DE TONNER / CILINDRO'), true);
  assert.equal(classificar.mesmoServico('RESET DE SENHA', 'RESET DE SENHA (SAU)'), false, 'nome mais específico é outro serviço');
  assert.equal(classificar.mesmoServico('ERRO DE IMPRESSÃO', 'ERRO DE PROCESSO'), false);
});

test('"tonner" e "cilindro" caem na opção da lista, com a grafia da lista', () => {
  const lista = ['SUBSTITUICAO DE TONNER E CILINDRO', 'ERRO DE IMPRESSÃO'];
  ['impressora sem tonner', 'preciso trocar o cilindro da impressora', 'toner acabou'].forEach(function (descricao) {
    const r = sugerir(descricao, lista);
    assert.equal(r.escolhido, 'SUBSTITUICAO DE TONNER E CILINDRO', descricao);
    assert.equal(r.origem, 'regra');
  });
});

test('regra apontando para serviço inexistente avisa e usa o mais próximo', () => {
  const r = classificar.sugerir('erro ao imprimir', ['ERRO DE IMPRESSAO NA REDE'], {
    regras: [{ quando: ['erro ao imprimir'], servico: 'ERRO DE IMPRESSÃO' }]
  });
  assert.equal(r.escolhido, 'ERRO DE IMPRESSAO NA REDE');
  assert.equal(r.origem, 'regra-aproximada');
  assert.match(r.avisos.join(' '), /não existe na lista atual/);
});

test('sugere palavra-chave para uma regra nova, ignorando as já usadas', () => {
  const palavra = classificar.sugerirPalavraChave('projetor da sala de reuniao sem imagem', classificar.REGRAS_PADRAO);
  assert.ok(palavra && palavra.length >= 5, 'deveria sugerir uma palavra: ' + palavra);
  assert.ok(['projetor', 'reuniao', 'imagem'].includes(palavra), 'palavra inesperada: ' + palavra);

  const jaUsada = classificar.sugerirPalavraChave('toner acabou', [{ quando: ['toner'], servico: 'X' }]);
  assert.notEqual(jaUsada, 'toner');
});

test('palavra-chave mais longa vence a mais curta', () => {
  const regras = [
    { quando: ['senha'], servico: 'RESET DE SENHA (SAU)' },
    { quando: ['senha do senior'], servico: 'RESET DE SENHA SENIOR' }
  ];
  const r = classificar.sugerir('resetar a senha do senior por favor', SERVICOS, { regras: regras });
  assert.equal(r.escolhido, 'RESET DE SENHA SENIOR');
});

test('ignora a opção "Selecione ..." da lista', () => {
  const r = sugerir('atalho na área de trabalho', ['Selecione ...', 'ATALHO']);
  assert.equal(r.escolhido, 'ATALHO');
});

test('regras vão e voltam do formato de texto', () => {
  const texto = classificar.regrasParaTexto(classificar.REGRAS_PADRAO);
  const analise = classificar.textoParaRegras(texto);
  assert.deepEqual(analise.erros, []);
  assert.equal(analise.regras.length, classificar.REGRAS_PADRAO.length);
  assert.equal(classificar.regrasParaTexto(analise.regras), texto);
});

test('linha malformada gera erro apontando o número', () => {
  const analise = classificar.textoParaRegras('# comentário\nsenha => RESET DE SENHA (SAU)\nlinha sem seta');
  assert.equal(analise.regras.length, 1);
  assert.match(analise.erros[0], /Linha 3/);
});

test('conferirRegras aponta regras órfãs com sugestão', () => {
  const invalidas = classificar.conferirRegras(
    [{ quando: ['x'], servico: 'ERRO DE IMPRESSAO' }, { quando: ['y'], servico: 'ATALHO' }],
    ['ERRO DE IMPRESSÃO', 'ATALHO']
  );
  assert.equal(invalidas.length, 0, 'acento não deveria contar como divergência');

  const outras = classificar.conferirRegras([{ quando: ['z'], servico: 'SERVIÇO QUE NÃO EXISTE' }], ['ATALHO']);
  assert.equal(outras.length, 1);
});

test('todas as regras padrão apontam para serviços da lista observada', () => {
  const invalidas = classificar.conferirRegras(classificar.REGRAS_PADRAO, SERVICOS);
  assert.deepEqual(
    invalidas.map((i) => i.servico),
    []
  );
});
