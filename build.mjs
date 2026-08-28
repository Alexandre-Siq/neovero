/*
 * Gera os dois formatos de distribuição a partir dos mesmos fontes:
 *   dist/neovero-fechamento-rapido.user.js  -> Tampermonkey/Violentmonkey
 *   dist/extensao/                          -> extensão Chrome/Edge (MV3, carregada sem compactar)
 * Não há dependências externas: é concatenação na ordem de carga.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.dirname(new URL(import.meta.url).pathname);

/* Permite ao Tampermonkey oferecer atualização em um clique. */
const URL_DISTRIBUICAO =
  'https://raw.githubusercontent.com/Alexandre-Siq/neovero/cursor/neovero-fechamento-rapido-3c8c/dist/neovero-fechamento-rapido.user.js';

const ARQUIVOS = [
  'src/util/text.js',
  'src/util/dates.js',
  'src/util/async.js',
  'src/util/dom.js',
  'src/core/log.js',
  'src/core/config.js',
  'src/core/classificar.js',
  'src/core/localizar.js',
  'src/core/campos.js',
  'src/core/fluxo.js',
  'src/core/lote.js',
  'src/core/diagnostico.js',
  'src/ui/estilos.js',
  'src/ui/aprender.js',
  'src/ui/painel.js',
  'src/main.js'
];

async function lerJson(relativo) {
  return JSON.parse(await readFile(path.join(RAIZ, relativo), 'utf8'));
}

function cabecalhoUserscript(pkg, matches) {
  const linhas = [
    '// ==UserScript==',
    '// @name         Neovero+ — fechamento rápido de chamados',
    '// @namespace    https://github.com/neovero-mais',
    `// @version      ${pkg.version}`,
    '// @description  Lança a ocorrência e fecha a Ordem de Serviço do Neovero em um clique, com presets configuráveis.',
    '// @author       —',
    ...matches.map((m) => `// @match        ${m}`),
    `// @updateURL    ${URL_DISTRIBUICAO}`,
    `// @downloadURL  ${URL_DISTRIBUICAO}`,
    '// @grant        GM_setValue',
    '// @grant        GM_getValue',
    '// @run-at       document-idle',
    '// ==/UserScript==',
    '',
    '/*',
    ' * O Neovero da sua empresa está em outro endereço?',
    ' * Acrescente uma linha "// @match https://SEU-ENDERECO/*" no bloco acima',
    ' * (ou edite config/hosts.json e rode "npm run build").',
    ' */',
    ''
  ];
  return linhas.join('\n');
}

async function montarCorpo(versao) {
  const partes = [];
  for (const arquivo of ARQUIVOS) {
    const conteudo = await readFile(path.join(RAIZ, arquivo), 'utf8');
    partes.push(`/* ===== ${arquivo} ===== */\n${conteudo.replace(/__VERSAO__/g, versao)}`);
  }
  return ['(function () {', "'use strict';", '', partes.join('\n'), '})();', ''].join('\n');
}

function paginaAutonoma(titulo, descricao, scripts) {
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${titulo}</title>`,
    '</head>',
    '<body>',
    `<!-- ${descricao} -->`,
    ...scripts.map((codigo) => `<script>\n${codigo}\n</script>`),
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

async function main() {
  const pkg = await lerJson('package.json');
  const hosts = await lerJson('config/hosts.json');
  const matches = hosts.matches && hosts.matches.length ? hosts.matches : ['*://*/*'];

  const corpo = await montarCorpo(pkg.version);
  const dist = path.join(RAIZ, 'dist');
  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, 'extensao'), { recursive: true });

  const userscript = cabecalhoUserscript(pkg, matches) + corpo;
  await writeFile(path.join(dist, 'neovero-fechamento-rapido.user.js'), userscript, 'utf8');

  const manifesto = {
    manifest_version: 3,
    name: 'Neovero+ — fechamento rápido de chamados',
    version: pkg.version,
    description: 'Lança a ocorrência e fecha a Ordem de Serviço do Neovero em um clique.',
    content_scripts: [
      {
        matches: matches.map((m) => m.replace('*://', 'https://')),
        js: ['content.js'],
        run_at: 'document_idle',
        all_frames: false,
        world: 'MAIN'
      }
    ]
  };
  await writeFile(path.join(dist, 'extensao', 'manifest.json'), JSON.stringify(manifesto, null, 2), 'utf8');
  await writeFile(path.join(dist, 'extensao', 'content.js'), corpo, 'utf8');

  /*
   * Páginas de um único arquivo, para testar sem instalar nada e sem tocar no Neovero.
   * O título contém "Neovero", que é o que faz o script se reconhecer na página.
   */
  const appFalso = await readFile(path.join(RAIZ, 'demo/app-falso.js'), 'utf8');
  const autoteste = await readFile(path.join(RAIZ, 'demo/autoteste.js'), 'utf8');
  const roteiro = await readFile(path.join(RAIZ, 'demo/roteiro.js'), 'utf8');

  await writeFile(
    path.join(dist, 'autoteste.html'),
    paginaAutonoma(
      'Autoteste do Neovero+ (demonstração)',
      'Abra este arquivo no navegador: ele roda o fluxo de fechamento contra uma replica da tela do Neovero.',
      [appFalso, corpo, autoteste]
    ),
    'utf8'
  );

  await writeFile(
    path.join(dist, 'demo-autonomo.html'),
    paginaAutonoma(
      'Neovero (demonstração) — Monitor de Atendimento',
      'Replica da tela do Neovero com o script embutido, para teste manual sem instalar nada.',
      [appFalso, corpo, roteiro]
    ),
    'utf8'
  );

  const tamanho = (Buffer.byteLength(userscript) / 1024).toFixed(1);
  console.log(`ok: dist/neovero-fechamento-rapido.user.js (${tamanho} kB)`);
  console.log(`ok: dist/extensao/ (manifest MV3, matches: ${manifesto.content_scripts[0].matches.join(', ')})`);
  console.log('ok: dist/autoteste.html (verificação automática no navegador)');
  console.log('ok: dist/demo-autonomo.html (réplica da tela para teste manual)');
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
