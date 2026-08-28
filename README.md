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

- [Instalação](#instalação)
- [Como usar](#como-usar)
- [Presets](#presets)
- [Quando o script não achar um botão (calibração)](#quando-o-script-não-achar-um-botão-calibração)
- [O que eu preciso de você](#o-que-eu-preciso-de-você)
- [Segurança e limites](#segurança-e-limites)
- [Desenvolvimento](#desenvolvimento)

## Instalação

### Opção A — Tampermonkey (recomendada para testar)

1. Instale a extensão [Tampermonkey](https://www.tampermonkey.net/) no Chrome/Edge/Firefox.
2. Abra o arquivo [`dist/neovero-fechamento-rapido.user.js`](dist/neovero-fechamento-rapido.user.js),
   copie o conteúdo, e no Tampermonkey use *Criar novo script* → cole → *Salvar*.
3. Se o Neovero da empresa **não** estiver em um endereço `*.neovero.com`, acrescente no topo
   do script uma linha com o endereço real:

```js
// @match        https://neovero.suaempresa.com.br/*
```

4. Abra o Neovero. Um painel escuro "Neovero+" aparece no canto inferior direito.

### Opção B — extensão do Chrome (para distribuir para a equipe)

1. Edite `config/hosts.json` com o endereço do seu Neovero e rode `npm run build`.
2. Em `chrome://extensions`, ative *Modo do desenvolvedor* → *Carregar sem compactação* →
   selecione a pasta `dist/extensao`.

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
| **⚙** | Presets, comportamento, calibração de seletores e diagnóstico |

**Comece pelo "Simular"** nos primeiros chamados: ele preenche tudo e para, então você
confere os valores e salva na mão. Depois de duas ou três conferências, passe a usar
"Fechar chamado".

Durante a execução o painel mostra o passo atual. `Esc` cancela. Qualquer divergência
(combo sem a opção do preset, campo que não aceitou a data, botão não encontrado) **aborta
o fluxo** e mostra o motivo — o script nunca salva uma ocorrência pela metade nem fecha a OS
sem antes confirmar que a ocorrência entrou.

## Presets

Um preset é a resposta para "que ocorrência e que serviço eu lanço nesse tipo de chamado":

| Campo | Exemplo |
| --- | --- |
| Ocorrência (obrigatório) | `SUPORTE - TI` |
| Serviço (obrigatório) | `CONFIGURAÇÃO DE EQUIPAMENTOS` |
| Causa (opcional) | `ERRO DE CONFIGURAÇÃO` |
| Interno/Externo | `Interno` |
| Observação (opcional) | `Atendimento remoto realizado.` |
| Regra de datas | `Terminou agora` + duração `1 min` |

Regras de data disponíveis:

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

Se algum passo falhar com "não encontrado":

1. Abra **⚙ → Seletores**.
2. Clique em **Aprender** na linha correspondente.
3. Clique no botão/campo real na tela do Neovero.

O seletor CSS fica gravado e passa a ter prioridade sobre a busca por texto. É uma vez só,
por navegador (e pode ser exportado para os colegas).

## O que eu preciso de você

O código já está pronto e testado contra uma réplica da tela (41 testes automatizados,
incluindo o fluxo completo de ponta a ponta). O que falta é ajustar aos detalhes do
HTML real do Neovero. Em ordem de prioridade:

1. **Testar com "Simular" em um chamado real** e me mandar o conteúdo do botão **Log**.
   Isso já resolve a maior parte dos ajustes.
2. **Arquivo de diagnóstico** (⚙ → Diagnóstico → *Iniciar gravação* → feche um chamado à mão
   → *Parar e baixar*). O JSON traz a estrutura do modal e as chamadas de rede, com e-mail,
   CPF, telefone e tokens mascarados. Com ele eu deixo os seletores exatos em vez de heurísticos.
3. **O endereço do Neovero de vocês** (só o domínio), para o `@match` sair certo.
4. **Confirmação de política de TI**: podem instalar Tampermonkey ou uma extensão sem loja?
   Se não puderem, tem uma alternativa em [Fase 2](#fase-2--fechamento-pela-api).
5. **As combinações que vocês mais usam** (ocorrência + serviço + causa), para eu já entregar
   os presets prontos em vez de você cadastrar um por um.
6. **Regra de negócio das datas**: a ocorrência deve ter 1 minuto (como hoje) ou refletir o
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
npm test          # 41 testes: texto, datas, espera, config, build e fluxo completo em jsdom
npm run build     # gera dist/ (userscript + extensão)
```

Estrutura:

```
src/util/     text (comparação tolerante a acento/caixa), dates (formato pt-BR), async (espera com timeout), dom
src/core/     config (presets), localizar (elemento lógico → DOM), campos (preencher e verificar),
              fluxo (orquestração), lote, diagnostico, log
src/ui/       painel, estilos, aprender (captura de seletor por clique)
test/ajuda/   réplica da tela do Neovero em jsdom, usada nos testes de fluxo
```

O `dist/` é versionado de propósito, para instalar sem precisar de Node.
