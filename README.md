# Rabisco

Anote e desenhe por cima de qualquer programa: slides, navegador, PDF, vídeo. Funciona no Windows e no macOS, e também como [extensão do Chrome](#extensão-do-chrome) para anotar páginas web.

**[⬇ Baixar a versão mais recente](https://github.com/webconversaoextrema/rabisco/releases/latest)**. Veja em [Instalação](#instalação) qual arquivo escolher.

## Como usar

O Rabisco abre com uma barra de ferramentas no canto esquerdo da tela. Arraste pelos três pontinhos no topo para mudar a barra de lugar.

- **Modo mouse** (seta): os cliques vão para os programas normalmente e os desenhos continuam na tela.
- **Modo desenho**: escolher qualquer ferramenta liga o desenho. Para voltar ao mouse, aperte `Esc` ou `Ctrl+Shift+D`.

### Minimizar

O botão **—** esconde a barra, e os desenhos continuam na tela. O Rabisco fica com um ícone perto do relógio: um clique mostra a barra de novo e o botão direito abre um menu com desenhar, limpar e sair. `Ctrl+Shift+H` também mostra e esconde a barra.

No Windows 11, o ícone começa escondido na setinha **^** ao lado do relógio. Para deixá-lo sempre visível, arraste-o da setinha para a barra, ou vá em **Configurações → Personalização → Barra de tarefas → Outros ícones da bandeja** e ative o Rabisco. No Mac, o ícone fica na barra de menus, no topo da tela.

### Atalhos que funcionam em qualquer programa

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+D` | Liga/desliga o modo desenho |
| `Ctrl+Shift+X` | Apaga tudo |
| `Ctrl+Shift+H` | Mostra/esconde a barra |

No Mac, use `Cmd` no lugar de `Ctrl`.

### Atalhos no modo desenho

| Tecla | Ação |
|---|---|
| `P` | Caneta |
| `H` | Marca-texto |
| `E` | Borracha (apaga o traço inteiro) |
| `L` / `A` | Linha / seta |
| `R` / `O` | Retângulo / elipse |
| `T` | Texto (`Enter` pula linha; `Esc`, `Ctrl+Enter`, o botão **✓ Concluir** ou um clique fora concluem) |
| `1` a `8` | Cores |
| `[` e `]` | Diminui / aumenta a espessura (com o texto: tamanho P / M / G) |
| `W` / `B` | Quadro branco / quadro negro |
| `Ctrl+Z` / `Ctrl+Y` | Desfazer / refazer |
| `Ctrl+C` | Copiar print (com seleção de área) |
| `Delete` | Apaga tudo nesta tela |
| `Esc` | Volta ao modo mouse |
| `Shift` segurado | Linhas em 45°, quadrados e círculos |

Em mesas digitalizadoras, a caneta respeita a pressão e a ponta traseira funciona como borracha.

Com a ferramenta de texto selecionada, a linha de espessura da barra vira os tamanhos **P**, **M** e **G**. Mudar tamanho ou cor enquanto digita já altera o texto que está sendo escrito.

### Cores, contorno e preenchimento

Acima das cores ficam dois botões: **preenchimento** à esquerda (quadrado cheio) e **borda** à direita (quadrado vazado). O botão selecionado define o que a paleta e a linha de opacidade logo abaixo vão alterar.

- **Preenchimento**: cor e opacidade (sem preenchimento, 25%, 50% ou 100%). Vale para retângulo e elipse.
- **Borda**: cor e opacidade (sem borda, 25%, 50% ou 100%). Vale para todas as ferramentas, exceto o marca-texto. "Sem borda" só se aplica a retângulo e elipse com preenchimento. Nas outras ferramentas, o traço continua visível.

Escolher uma cor enquanto a opção "sem" está ativa liga aquela parte automaticamente. Deixar a forma sem borda e sem preenchimento liga o preenchimento em 50%, para ela não ficar invisível.

### Prints

| Botão | Ação |
|---|---|
| Duas folhas (`Ctrl+C` no modo desenho) | Copia para a área de transferência e passa para o modo mouse. Clique onde quer colar e use `Ctrl+V`. |
| Câmera | Salva em arquivo. Abre a janela para escolher pasta e nome, começando pela última pasta usada. |

Nos dois casos, a tela congela e escurece. Arraste para escolher a área. Um clique ou `Enter` pega a tela inteira. `Esc` ou o botão direito cancela. O print inclui as anotações e pega o monitor onde está o mouse.

## Instalação

Baixe na página de [versões](https://github.com/webconversaoextrema/rabisco/releases/latest):

| Sistema | Arquivo |
|---|---|
| Windows (instalar) | `Rabisco-x.y.z-windows-instalador.exe` |
| Windows (sem instalar) | `Rabisco-x.y.z-windows-portatil.exe` |
| Mac (Intel e Apple Silicon) | `Rabisco-x.y.z-mac.dmg` |

**Windows:** o app não é assinado digitalmente, então o Windows pode mostrar "O Windows protegeu o computador". Nesse caso, clique em **Mais informações → Executar assim mesmo**.

**macOS:** abra o `.dmg` e arraste o Rabisco para **Aplicativos**. Como o app não é notarizado pela Apple, na primeira vez o macOS avisa que não pode verificá-lo. Vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o aviso do Rabisco e clique em **Abrir Mesmo Assim**. Para os prints funcionarem, libere o Rabisco em **Privacidade e Segurança → Gravação de Tela**.

## Extensão do Chrome

Para aulas no navegador, o Rabisco também existe como extensão do Chrome, na pasta [`extensao-chrome/`](extensao-chrome). Ela tem as mesmas ferramentas do app, mas só desenha sobre páginas web.

**Instalar:**

1. Baixe o `Rabisco-extensao-chrome-x.y.z.zip` em [versões](https://github.com/webconversaoextrema/rabisco/releases/latest) e descompacte numa pasta que não vá ser apagada.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação** e escolha a pasta.
4. Clique no quebra-cabeça 🧩 da barra do Chrome e fixe o Rabisco.

**Usar:**

| Ação | Como |
|---|---|
| Abrir/fechar o Rabisco na aba | Clique no ícone do Rabisco ou `Alt+Shift+R` |
| Alternar desenho/mouse | `Alt+Shift+D`, `Esc` ou o botão de seta |
| Demais atalhos | Os mesmos do app (P, H, E, T, `Ctrl+Z`, `Ctrl+C`…) |

Diferenças em relação ao app:

- **Os desenhos acompanham a rolagem da página.** Um círculo num título sobe junto com ele.
- **No modo desenho, a roda do mouse continua rolando a página.**
- **O Rabisco funciona na aba em que foi aberto** e some ao recarregar ou mudar de página.
- **O Chrome não permite extensões nas próprias páginas internas**, como `chrome://`, nova aba e Chrome Web Store. Nelas, o ícone mostra um ✕ vermelho.
- **Sites com rolagem dentro de um quadro interno**, como alguns painéis e o Gmail, não movem os desenhos junto.
- **Alguns poucos sites bloqueiam copiar imagens.** Nesses, use o botão de salvar.
- Os atalhos podem ser trocados em `chrome://extensions/shortcuts`.

A extensão só acessa a aba em que você ativa o Rabisco, então a instalação não pede acesso a todos os sites.

**Publicar na Chrome Web Store** (opcional, elimina o modo do desenvolvedor e atualiza sozinha): crie uma conta em [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) (taxa única de US$ 5), envie o mesmo `.zip` e preencha a descrição e as imagens. A revisão do Google leva de alguns dias a algumas semanas.

## Desenvolvimento

Requer Node.js 18 ou superior.

```bash
npm install
npm start
```

Para gerar os instaladores localmente:

```bash
npm run dist:win   # no Windows: instalador + versão portátil em dist/
npm run dist:mac   # precisa ser rodado em um Mac
```

### Publicar uma nova versão

Os instaladores de Windows e Mac são gerados pelo GitHub Actions (`.github/workflows/instaladores.yml`) sempre que uma tag `v*` é enviada:

1. Atualize `version` no `package.json` (ex.: `0.2.0`).
2. Faça commit, crie a tag e envie:

```bash
git tag v0.2.0
git push origin main v0.2.0
```

Em cerca de 10 minutos, a release aparece em [Releases](https://github.com/webconversaoextrema/rabisco/releases) com os três arquivos.
