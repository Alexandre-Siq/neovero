# Como coletar as informações para o ajuste fino

Cada item abaixo é independente: mande o que der. O item 1 é o mais importante.

## 1. Log de uma execução em "Simular"

1. Abra um chamado real no Neovero (uma OS que você fecharia normalmente).
2. No painel Neovero+, escolha o preset e clique em **Simular**.
   O modal "Nova Ocorrência" será preenchido e **não** será salvo.
3. Confira na tela se ocorrência, datas e serviço ficaram certos.
4. Clique em **Log** → **Copiar** e cole o conteúdo na conversa.

O log diz exatamente onde o script acertou e onde errou, no formato:

```
09:41:02 [passo] Selecionar ocorrência: SUPORTE - TI {"alterado":true,"texto":"SUPORTE - TI","score":1}
09:41:03 [erro]  Falhou: Data final do serviço: 28/08/2026, 09:41 {"erro":"Não foi possível escrever a Data Final do Serviço","tentado":"28/08/2026, 09:41","lido":"__/__/____"}
```

Nesse exemplo eu já saberia que o campo tem máscara e que a escrita precisa ser
tecla por tecla (é só mudar *Comportamento → Escrita nos campos de data* para `teclas`,
mas com o log eu deixo isso automático).

## 2. Arquivo de diagnóstico (o mais completo)

1. Painel → **⚙ → Diagnóstico → Iniciar gravação**.
2. **Feche um chamado inteiramente à mão**, do jeito que você faz hoje
   (clicar em Ocorrência, preencher, Salvar, Fechar OS, confirmar).
3. Volte em **⚙ → Diagnóstico → Parar e baixar**.
4. Um arquivo `neovero-diagnostico-<data>.json` é baixado. Mande esse arquivo.

O que tem dentro:

| Seção | Para que serve |
| --- | --- |
| `resolucaoDeSeletores` | quais elementos a heurística encontrou (e quais não) |
| `modalOcorrencia.controles` | tipo real de cada campo (select nativo? input com máscara? widget?) |
| `modalOcorrencia.html` | HTML do modal, para gerar seletores exatos |
| `janelaOs.arvore` | estrutura da janela da OS, incluindo a barra com o botão "Fechar OS" |
| `requisicoes` | as chamadas HTTP do fechamento manual — base para a Fase 2 (fechar via API) |

**Privacidade:** e-mails, CPF, telefones e campos com nome `senha`/`token`/`authorization`
são substituídos por `«email»`, `«cpf»`, `«telefone»`, `«oculto»`. Textos livres da tela
(descrição da requisição, nome do requisitante em maiúsculas) **não** são mascarados —
prefira gravar em um chamado sem dado sensível, ou abra o JSON e apague o que não quiser
compartilhar antes de enviar.

Se preferir não usar a gravação de rede, dá para mandar só a estrutura:
**⚙ → Diagnóstico → Capturar tela atual**, com o modal "Nova Ocorrência" aberto.

## 3. Alternativa manual, sem instalar nada

Se a política de TI não permitir extensões agora, ainda consigo trabalhar com:

1. **HTML do modal**: abra o modal "Nova Ocorrência", pressione `F12` → aba *Elements* →
   clique com o botão direito no elemento do modal → *Copy* → *Copy outerHTML* → cole em um
   arquivo `.txt`.
2. **HAR do fechamento**: `F12` → aba *Network* → feche um chamado à mão → botão direito na
   lista → *Save all as HAR with content*. O HAR contém cookies e cabeçalhos de sessão:
   **não** poste em lugar público, e se possível troque a senha depois.
3. **Prints** com o painel de elementos aberto em cada campo (ocorrência, datas, serviço)
   e no botão "Fechar OS".

## 4. Lista de presets

Uma tabela simples, mesmo que informal:

| Tipo de chamado | Ocorrência | Serviço | Causa | Interno/Externo |
| --- | --- | --- | --- | --- |
| Computador não liga | `SUPORTE - TI` | `CONFIGURAÇÃO DE EQUIPAMENTOS` | | Interno |
| Impressora | `SUPORTE - TI` | ? | | Interno |
| Rede/wi-fi | `SUPORTE - TI` | ? | | Interno |

Se puder, mande também a **lista completa de opções** dos combos "Ocorrência", "Serviço" e
"Causa" (ou um print delas abertos). Assim eu valido nomes parecidos e evito o script
escolher a opção errada por semelhança de texto.

## 5. Perguntas de decisão

1. As ocorrências devem ter **1 minuto** (como hoje) ou o **tempo real** do atendimento?
2. Alguém audita esses horários? Existe indicador de SLA em cima da data final?
3. A OS precisa estar com atendimento iniciado antes de fechar? (o script clica em
   "Iniciar Atendimento" quando o botão está visível — dá para desligar)
4. Faz sentido preencher a **Causa** automaticamente, ou isso varia caso a caso?
5. Quantas pessoas usariam? (se for a equipe toda, vale empacotar a extensão em vez do
   userscript)
