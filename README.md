# Camargos Finance

Controlo de gastos diarios da familia Camargos.

- **App:** https://camargos-finance.firebaseapp.com
- **Backend:** Firebase (projeto `camargos-finance`, Firestore em europe-west1)
- **Alojamento:** Firebase Hosting. `npx -y firebase-tools deploy --only hosting`
  a partir da raiz do repositorio.
- **Login:** conta Google. So o dono apaga e administra.
- **Offline:** persistencia do Firestore — lanca sem rede e sincroniza sozinho.

## O endereco nao e um detalhe

A app **tem** de ser aberta no mesmo dominio que termina o login do Google
(`authDomain` no `app.js`). Servida de outro dominio, o Safari do iPhone isola o
armazenamento do dominio de login e o Google volta com
*«missing initial state»* — foi o que aconteceu enquanto a app vivia no GitHub Pages.

O Firebase Hosting serve o mesmo site em `.web.app` **e** em `.firebaseapp.com`.
Usa-se o **`.firebaseapp.com`** porque e o unico que o cliente OAuth do projeto ja
tem autorizado como `redirect_uri`; com o `.web.app` o Google responde
`Erro 400: redirect_uri_mismatch`, e isso so se resolve na consola do Google Cloud.
Se algum dia o `.web.app` for para ser usado, e la que se acrescenta
`https://camargos-finance.web.app/__/auth/handler`.

## Ficheiros

| Ficheiro | O que e |
|---|---|
| `index.html` | A app inteira: markup e estilos, dois ecras (Lancar e Mes) |
| `app.js` | Logica: auth, agregado familiar, lancamentos, ecra do mes, offline |
| `manifest.json` | PWA — nome, cores, icones e atalhos |
| `sw.js` | Service worker: arranque sem rede |
| `firebase.json` · `.firebaserc` | O que se publica no Hosting e em que projeto |
| `icon-*.png` | Icones da app (192, 512, maskable) e apple-touch-icon |

## Ecras

- **Lancar** — o formulario de sempre: tipo de gasto, valor, onde, pagamento, quem.
  Tem tambem **leitura de talao por foto**: a foto e reduzida no telemovel, vai para
  o Apps Script (que ja tinha o motor do Gemini com recurso ao OCR do Drive), e o que
  foi lido e mostrado para confirmar antes de preencher o formulario.
- **Mes** — acompanhamento: anel de progresso (orcamento ou mes anterior), gastos
  diarios por categoria, por pessoa, dia a dia, por metodo de pagamento e a lista
  do mes. Tocar numa categoria ou num dia filtra a lista. O total do mes =
  gastos diarios + contas fixas, como na planilha.
- **Fixas** — as contas fixas do mes: previsto / pago / por pagar, agrupadas por dia
  de vencimento, com um toque para marcar como paga. So o dono marca, edita e cria.

## Dados no Firestore

| Caminho | O que guarda |
|---|---|
| `households/{hid}/entries/{id}` | lancamentos diarios |
| `households/{hid}/recurring/{id}` | contas fixas: name, category, issuer, dueDay, amountCents, active |
| `households/{hid}/months/{AAAA-MM}/bills/{recurringId}` | por mes: paid, e amountCents quando o valor do mes e diferente do previsto |
| `households/{hid}.monthlyBudgetCents` | orcamento mensal (so o dono define) |
| `households/{hid}.ocrUrl` | URL do endpoint de leitura de taloes — fica aqui, e nao no codigo, para nao andar no repositorio publico |

As Security Rules ja cobriam isto: dentro de `households/{hid}` ha um
`match /{documento=**}` que deixa qualquer membro ler e so o dono escrever — por
isso as contas fixas nao precisaram de regras novas, e marcar uma conta como paga
e uma accao do dono.

As cores dos graficos (`--g-*` no `index.html`) foram validadas para fundo escuro:
banda de luminosidade, separacao sob daltonismo (protan/deutan) e contraste contra
o cartao. Nao trocar por cores "mais bonitas" sem revalidar — cada barra tem sempre
rotulo de texto, que e o que torna a cor um reforco e nao a unica pista.

## Leitura de taloes

A app envia a foto em POST para o Web App do Apps Script. Dois detalhes que nao se
mexem sem partir tudo:

- o pedido vai em `text/plain` de proposito — e o que faz dele um *simple request*
  e evita o preflight OPTIONS, a que os Web Apps do Apps Script nao sabem responder;
- o servidor valida o `idToken` do Firebase no Identity Toolkit e confirma que o
  email e de um membro do agregado. Nao se acredita no que o cliente diz.

## Notas

As chaves em `app.js` nao sao segredos — sao identificadores de cliente do
Firebase. O que protege os dados sao as Security Rules do Firestore e a lista
de dominios autorizados no Firebase Auth.
