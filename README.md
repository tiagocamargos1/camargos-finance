# Camargos Finance

Controlo de gastos diarios da familia Camargos.

- **App:** https://tiagocamargos1.github.io/camargos-finance/
- **Backend:** Firebase (projeto `camargos-finance`, Firestore em europe-west1)
- **Login:** conta Google. So o dono apaga e administra.
- **Offline:** persistencia do Firestore — lanca sem rede e sincroniza sozinho.

## Ficheiros

| Ficheiro | O que e |
|---|---|
| `index.html` | A app inteira: markup e estilos, dois ecras (Lancar e Mes) |
| `app.js` | Logica: auth, agregado familiar, lancamentos, ecra do mes, offline |
| `manifest.json` | PWA — nome, cores, icones e atalhos |
| `sw.js` | Service worker: arranque sem rede |
| `icon-*.png` | Icones da app (192, 512, maskable) e apple-touch-icon |

## Ecras

- **Lancar** — o formulario de sempre: tipo de gasto, valor, onde, pagamento, quem.
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

As Security Rules ja cobriam isto: dentro de `households/{hid}` ha um
`match /{documento=**}` que deixa qualquer membro ler e so o dono escrever — por
isso as contas fixas nao precisaram de regras novas, e marcar uma conta como paga
e uma accao do dono.

As cores dos graficos (`--g-*` no `index.html`) foram validadas para fundo escuro:
banda de luminosidade, separacao sob daltonismo (protan/deutan) e contraste contra
o cartao. Nao trocar por cores "mais bonitas" sem revalidar — cada barra tem sempre
rotulo de texto, que e o que torna a cor um reforco e nao a unica pista.

## Notas

As chaves em `app.js` nao sao segredos — sao identificadores de cliente do
Firebase. O que protege os dados sao as Security Rules do Firestore e a lista
de dominios autorizados no Firebase Auth.
