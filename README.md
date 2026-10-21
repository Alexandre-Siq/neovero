# Neovero+ — fechamento rápido de chamados

Automatiza o ritual de fechar uma Ordem de Serviço no Neovero: em vez de abrir o modal
"Nova Ocorrência", escolher a ocorrência, digitar duas datas, escolher o serviço, salvar
e só então clicar em "Fechar OS", você escolhe um **preset** e clica em **um botão**.

O script roda dentro do navegador, em cima da tela do Neovero. Não precisa de servidor,
não precisa de API, não precisa de permissão do fornecedor.

```
Fluxo manual (hoje)                     Com o Neovero+
─────────────────────────────────────   ─────────────────────────────
1. clicar em "Ocorrência"               1. escolher o preset
2. escolher a ocorrência no combo       2. clicar em "Fechar chamado"
3. digitar Data da Ocorrência              (ou pressionar Alt+F)
4. digitar Data Final do Serviço
5. escolher o Serviço no combo
6. Salvar
7. clicar em "Fechar OS"
8. confirmar
```

## Índice

- [Testar sem instalar nada](#testar-sem-instalar-nada)
- [Instalação](#instalação)
- [Como usar](#como-usar)
- [Presets](#presets)
- [Quando o script não achar um botão (calibração)](#quando-o-script-não-achar-um-botão-calibração)
- [O que eu preciso de você](#o-que-eu-preciso-de-você)
- [Segurança e limites](#segurança-e-limites)
- [Desenvolvimento](#desenvolvimento)

## Testar sem instalar nada

Antes de mexer em chamado de verdade, dá para conferir se a automação funciona no seu navegador.
São dois arquivos que funcionam sozinhos (o script já vem embutido) e **não tocam no Neovero**:
eles rodam contra uma réplica da tela.

### 1. Autoteste (verificação automática)

1. Baixe [`dist/autoteste.html`](dist/autoteste.html) — no GitHub, abra o arquivo e use o botão
   *Download raw file*.
2. Abra o arquivo baixado no Chrome/Edge (duplo clique).
3. Ele executa 16 verificações sozinho: painel injetado, simulação preenchendo os campos,
   fechamento completo, campos opcionais, aborto quando o serviço do preset não existe, calibração
   de seletor, modo lote (inclusive com classificação por descrição), "Conferir tela",
   classificação pela descrição, intervalo de 1 minuto entre as datas, fila (fechar pela lista e
   botão flutuante sobre a linha), leitura completa de combo rolável e `iframe`.

**16/16 verde** = pode instalar. Se alguma falhar, clique em **Copiar relatório** e me mande o texto:
ele diz exatamente qual passo falhou e por quê.

### 2. Demonstração manual

1. Baixe [`dist/demo-autonomo.html`](dist/demo-autonomo.html) e abra no navegador.
2. É a réplica da tela do Neovero com o painel funcionando e um roteiro curto no canto inferior
   esquerdo. Clique em **Simular**, em **Fechar chamado**, teste o `Alt+F` e o **Log** à vontade —
   nada disso sai do seu navegador.

## Instalação

### Opção A — Tampermonkey (recomendada para testar)

1. Instale a extensão [Tampermonkey](https://www.tampermonkey.net/) no Chrome/Edge/Firefox.
2. Abra o link *raw* do arquivo [`dist/neovero-fechamento-rapido.user.js`](dist/neovero-fechamento-rapido.user.js).
   Como o nome termina em `.user.js`, o Tampermonkey intercepta e mostra a tela de instalação —
   clique em *Instalar*. Se a tela não aparecer, copie o conteúdo e use *Criar novo script* → cole →
   *Salvar*.
3. Abra `https://ishaoc.neovero.com/UI/Base/Menu.aspx#/`. Um painel escuro "Neovero+" aparece no
   canto inferior direito.
4. Abra um chamado e use **Simular** nas primeiras vezes: ele preenche o modal e para, para você
   conferir antes de salvar.

O endereço de vocês (`ishaoc.neovero.com`) já está na lista de `@match`, então não precisa editar
nada. Se algum dia mudar de domínio, acrescente uma linha no topo do script:

```js
// @match        https://novo-endereco/*
```

### Opção B — extensão do Chrome (para distribuir para a equipe)

1. Em `chrome://extensions`, ative *Modo do desenvolvedor* → *Carregar sem compactação* →
   selecione a pasta `dist/extensao` (já configurada para `ishaoc.neovero.com`).
2. Para outro domínio, edite `config/hosts.json` e rode `npm run build`.

> A extensão usa `world: "MAIN"` para conseguir ler/preencher os campos e (opcionalmente)
> gravar as chamadas de rede do diagnóstico.

## Como usar

O painel tem:

| Botão | O que faz |
| --- | --- |
| **Fechar chamado** (`Alt+F`) | Roda o fluxo completo: ocorrência → salvar → Fechar OS |
| **Simular** | Preenche o modal e **para antes de salvar**, para você conferir |
| **Só ocorrência** | Lança a ocorrência e deixa a OS aberta |
| **Lote** (`Alt+Shift+F`) | Fecha várias OS da lista do Monitor de Atendimento |
| **Log** | Passo a passo da última execução (útil quando algo falha) |
| **Fila** (`Alt+G` = próximo) | Fecha direto da lista do Monitor, sem abrir a OS antes |
| **Conferir tela** | **Só leitura.** Mostra o que o script encontra na tela e lista as opções reais dos combos |
| **⚙** | Presets, comportamento, calibração de seletores e diagnóstico |

**Comece pelo "Simular"** nos primeiros chamados: ele preenche tudo e para, então você
confere os valores e salva na mão. Depois de duas ou três conferências, passe a usar
"Fechar chamado".

Durante a execução o painel mostra o passo atual. `Esc` cancela. Qualquer divergência
(combo sem a opção do preset, campo que não aceitou a data, botão não encontrado) **aborta
o fluxo** e mostra o motivo — o script nunca salva uma ocorrência pela metade nem fecha a OS
sem antes confirmar que a ocorrência entrou.

## Primeira rodada em produção

A ordem abaixo vai do mais seguro para o mais definitivo. Cada passo produz um texto que dá para
copiar e mandar, então em geral **uma rodada resolve** em vez de uma ida e volta por campo.

### Passo 1 — "Conferir tela" (não altera nada)

Abra um chamado no Neovero e clique em **Conferir tela**. O script:

- localiza a janela da OS, lê o número e a data de abertura;
- procura os botões "Ocorrência", "Fechar OS" e "Iniciar Atendimento";
- abre o modal "Nova Ocorrência", identifica cada campo, **lista todas as opções** dos combos
  Ocorrência/Serviço/Causa e fecha o modal com "Cancelar".

O único efeito é abrir e cancelar o modal. Nada é salvo, e o atendimento não é iniciado.

No fim aparece um relatório com ✓ / ✕ por elemento, as opções encontradas e uma comparação
**preset × produção** (se o "SUPORTE - TI" e o "CONFIGURAÇÃO DE EQUIPAMENTOS" do preset existem
com esse nome exato lá). Clique em **Copiar para enviar** e mande o texto.

### Passo 2 — "Simular" (preenche e para antes de salvar)

Com os presets acertados, clique em **Simular**. Ele preenche o modal e **não salva**.
Nesse modo o fluxo é tolerante: se um campo falhar, ele registra o problema e continua, para você
ver todos os pontos de uma vez. O painel diz quantos problemas houve; o **Log** tem o detalhe.
A simulação também não clica em "Iniciar Atendimento", justamente para não mexer no chamado.

### Passo 3 — Fechar um chamado de verdade

Escolha um chamado que você fecharia de qualquer forma e clique em **Fechar chamado**. Confira o
resultado na tela (ocorrência lançada, OS encerrada). Se algo falhar no meio, o fluxo para: a
ocorrência pode ter sido lançada sem a OS ser fechada, e aí basta fechar à mão.

### Passo 4 — Só depois disso, lote

Com um preset de serviço automático, o lote trabalha em duas passadas:

1. **Leitura** — abre cada OS marcada só para ler a descrição e classificar o serviço. Não abre o
   modal de ocorrência e não escreve nada.
2. **Revisão** — mostra uma linha por chamado com a descrição, o serviço sugerido, a confiança e um
   combo com a lista completa para você corrigir. Deixar em "— não fechar esta OS —" tira o chamado
   do lote.
3. **Execução** — fecha cada OS com o serviço que você aprovou, sem reclassificar.

Dá para desmarcar a revisão e deixar o lote usar a sugestão de cada chamado direto, mas só vale a
pena depois que as regras estiverem afinadas.

## Fila de atendimento

Duas formas de fechar sem navegar até a OS:

- **Passe o mouse em uma linha do Monitor** e clique no botão `⚡ Fechar <número>` que aparece
  sobre ela. O script abre a OS, fecha e volta. Esse botão é um elemento flutuante nosso, não é
  injetado no HTML do Neovero — nenhuma re-renderização da tela o perde nem tem o layout alterado.
- **Botão Fila** no painel: lista os pendentes com um botão por linha, mais **Fechar o próximo**
  (`Alt+G`) e **Fechar em sequência**, que vai fechando um após o outro na ordem da lista.

O que já foi fechado (e o que falhou) sai da fila durante a sessão, então "o próximo" nunca volta
para o mesmo chamado — importante porque a lista do Neovero leva um tempo para atualizar. Em
sequência, o comportamento no erro segue a configuração do lote (parar no primeiro erro ou seguir),
e `Esc` interrompe.

Na janela da Fila dá para desmarcar "Confirmar cada OS antes de fechar" e deixar a sequência correr
sem parar — vale só depois que as regras de classificação estiverem afinadas.

## Classificação automática do serviço

Em vez de um serviço fixo por preset, o script pode escolher o **Serviço** a partir da
**descrição da requisição** que está na tela da OS.

Duas camadas, nesta ordem:

1. **Regras de palavra-chave** (previsíveis e editáveis em ⚙ → Classificação):

```
nao liga, nao esta ligando, sem energia => LIGAR EQUIPAMENTO
toner, tonner, cilindro => SUBSTITUIÇÃO DE TONNER/CILINDRO
sem internet, sem rede, nao conecta na rede => EQUIPAMENTO SEM ACESSO A REDE/INTERNET
```

Vence a palavra-chave mais longa que aparecer no texto. Palavra curta exige casamento exato
(`ris` não casa com "risco"), palavra média aceita plural (`toner` pega "toners") e palavra longa
aceita qualquer terminação (`travado` pega "travados").

2. **Semelhança por palavras**, quando nenhuma regra casa. Compara o texto do chamado com o nome de
cada serviço usando radicais ("ligando" ≈ "ligar", "configuração" ≈ "configurar").

### Como ele decide se pode agir sozinho

| Confiança | O que acontece |
| --- | --- |
| Regra casou (95%) | usa direto |
| Entre o mínimo e o limite de confirmação | **pergunta**, mostrando as alternativas ranqueadas |
| Abaixo do mínimo | usa o serviço do preset como reserva (ou aborta, se você desligar a reserva) |

Os limites ficam em ⚙ → Classificação. Com o padrão (mínimo 0,5 e confirmar abaixo de 0,9), toda
decisão tomada por semelhança passa por você antes de ser usada.

A lista de serviços vem da própria tela (o script lê o combo uma vez e guarda em cache). Isso
garante que ele só escolhe opções que existem de fato, e a aba de classificação avisa quando uma
regra aponta para um serviço que não está mais na lista.

**Lista completa, não só a parte visível.** O combo "Serviço" é uma lista rolável que renderiza
apenas a janela visível (são dezenas de itens). O script rola o painel até o fim para ler todos —
sem isso, a classificação consideraria só os primeiros serviços em ordem alfabética. A mesma
varredura vale na hora de selecionar: se a opção escolhida não está renderizada, ele rola até
encontrá-la e, em último recurso, digita para o próprio combo filtrar. Se a leitura vier menor que a
lista de referência, o script completa a base, avisa no log e no relatório de "Conferir tela".

Para ver o que ele faria sem fechar nada: **Conferir tela** mostra a descrição lida, o serviço
classificado, a confiança e as alternativas.

O nome do serviço é comparado por palavras significativas, então uma regra apontando para
`SUBSTITUIÇÃO DE TONNER/CILINDRO` casa com a entrada da lista mesmo que ela esteja escrita
`SUBSTITUICAO DE TONNER E CILINDRO`.

### Ele aprende com a sua correção

Quando o script pergunta e você escolhe uma opção diferente da sugerida, ele oferece criar uma regra
com uma palavra da descrição (você pode editar a palavra antes de confirmar). Da próxima vez, um
chamado parecido é classificado sozinho.

A caixa de escolha mostra as 6 melhores por semelhança e, abaixo, **a lista completa com busca** —
a resposta certa não precisa estar entre as mais bem colocadas para você poder escolhê-la ali.

## Datas da ocorrência

O padrão reproduz o que era feito à mão: **fim = agora** e **início = 1 minuto antes**. Esse
intervalo de 1 minuto é garantido em todas as regras de data — nunca saem iguais, porque o Neovero
recusa ocorrência com início igual ou posterior ao fim.

## Presets

Um preset é a resposta para "que ocorrência e que serviço eu lanço nesse tipo de chamado":

| Campo | Exemplo |
| --- | --- |
| Ocorrência (obrigatório) | `SUPORTE - TI` |
| Serviço | `CONFIGURAÇÃO DE EQUIPAMENTOS` (fixo) ou automático pela descrição |
| Causa (opcional) | `ERRO DE CONFIGURAÇÃO` |
| Interno/Externo | `Interno` |
| Observação (opcional) | `Atendimento remoto realizado.` |
| Regra de datas | `Terminou agora` + duração `1 min` |

Regras de data disponíveis (todas garantem no mínimo 1 minuto entre início e fim):

- **Terminou agora** — fim = agora, início = agora − duração. É o que você faz hoje (ocorrência de 1 minuto).
- **Começa agora** — início = agora, fim = agora + duração. Para quando você vai atender na sequência.
- **Início na abertura da OS** — lê a data de abertura na tela e usa como início; fim = agora.
  Reflete o tempo real do chamado (melhor para indicador, pior se ninguém quer ver "14 dias" no relatório).

Você pode ter quantos presets quiser (um por tipo de atendimento) e trocar no combo do painel.
A configuração é exportável/importável em JSON, então dá para configurar uma vez e distribuir
para o resto da equipe.

## Quando o script não achar um botão (calibração)

Todos os elementos são localizados por **texto visível** (`Ocorrência`, `Salvar`,
`Data Final do Serviço`, `Fechar OS`…), o que funciona sem eu conhecer o HTML do Neovero.
O caso frágil é botão só de ícone, como o de "Fechar OS", em que o texto vem de um tooltip.

A busca atravessa `iframe`s de mesma origem, porque `Menu.aspx` é uma aplicação ASP.NET com
janelas MDI e esse tipo de tela costuma carregar cada janela dentro de um frame. Os atalhos de
teclado e o modo "aprender" também são registrados dentro dos frames.

Se algum passo falhar com "não encontrado":

1. Abra **⚙ → Seletores**.
2. Clique em **Aprender** na linha correspondente.
3. Clique no botão/campo real na tela do Neovero.

O seletor CSS fica gravado e passa a ter prioridade sobre a busca por texto. É uma vez só,
por navegador (e pode ser exportado para os colegas).

## O que eu preciso de você

O código já está pronto e testado contra uma réplica da tela (119 testes automatizados,
incluindo o fluxo completo de ponta a ponta, com e sem `iframe`). O endereço já está resolvido
(`ishaoc.neovero.com`). O que falta é ajustar aos detalhes do HTML real. Em ordem de prioridade:

1. **Testar com "Simular" em um chamado real** e me mandar o conteúdo do botão **Log**.
   Isso já resolve a maior parte dos ajustes.
2. **Arquivo de diagnóstico** (⚙ → Diagnóstico → *Iniciar gravação* → feche um chamado à mão
   → *Parar e baixar*). O JSON traz a estrutura do modal e as chamadas de rede, com e-mail,
   CPF, telefone e tokens mascarados. Com ele eu deixo os seletores exatos em vez de heurísticos.
3. **Confirmação de política de TI**: podem instalar Tampermonkey ou uma extensão sem loja?
   Se não puderem, tem uma alternativa em [Fase 2](#fase-2--fechamento-pela-api).
4. **As combinações que vocês mais usam** (ocorrência + serviço + causa), para eu já entregar
   os presets prontos em vez de você cadastrar um por um.
5. **Regra de negócio das datas**: a ocorrência deve ter 1 minuto (como hoje) ou refletir o
   tempo real do atendimento? Se alguém audita esses números, é melhor decidir antes.

Detalhes de como coletar cada coisa: [`docs/coleta-de-dados.md`](docs/coleta-de-dados.md).

### Fase 2 — fechamento pela API

Se o diagnóstico mostrar que o Neovero fecha a OS via chamadas HTTP simples (o esperado),
o mesmo fluxo pode ser feito **sem abrir a tela**: um script que recebe a lista de OS e
fecha todas em sequência, com muito menos coisa para quebrar. Isso também abre a porta para
"fechar todos os chamados de configuração de equipamento do dia" em um comando.
Para isso eu preciso do item 2 acima (o JSON com as requisições) — e, idealmente, da
confirmação de que o fornecedor não proíbe isso em contrato.

## Segurança e limites

- Roda **na sua sessão**, no seu navegador. Não guarda senha, não manda dado para fora:
  a única persistência é a configuração no armazenamento local do navegador.
- Faz exatamente os mesmos cliques que você faria — nenhum atalho por trás do sistema.
- O modo lote é o único ponto realmente perigoso (fecha vários chamados com o mesmo preset).
  Ele é opt-in, tem limite máximo por execução, pede confirmação com a contagem e para no
  primeiro erro.
- O arquivo de diagnóstico mascara e-mails, CPF, telefones e tokens, mas ainda contém texto
  da tela (por exemplo a descrição da requisição). Dê uma olhada antes de compartilhar.
- Isto é uma automação de interface, não um recurso homologado pelo fornecedor. Se o Neovero
  mudar de layout, algum passo pode falhar — o script para e avisa em vez de fazer bobagem.

## Desenvolvimento

```bash
npm install       # só jsdom, usado nos testes
npm test          # 119 testes: texto, datas, espera, config, build e fluxo completo em jsdom
npm run build     # gera dist/ (userscript, extensão, autoteste.html e demo-autonomo.html)
```

Estrutura:

```
src/util/     text (comparação tolerante a acento/caixa), dates (formato pt-BR), async (espera com timeout), dom
src/core/     config (presets), localizar (elemento lógico → DOM), campos (preencher e verificar),
              classificar (descrição → serviço), fluxo (orquestração), fila, lote, diagnostico, log
src/ui/       painel, estilos, aprender (captura de seletor por clique), lista (botão sobre a linha)
demo/         app-falso.js (réplica da tela), autoteste.js (verificações no navegador), roteiro.js
test/         mesma réplica rodando em jsdom, mais os testes de lógica pura
```

A réplica da tela é a mesma nos dois lugares: `demo/app-falso.js` é carregado tanto pelas páginas
de `dist/` quanto pelos testes em jsdom, para não existirem duas versões divergindo.

Para desenvolver com recarga rápida: `npm run build` e sirva a pasta
(`python3 -m http.server 8765`), depois abra `http://localhost:8765/demo/index.html`.

O `dist/` é versionado de propósito, para instalar sem precisar de Node.
