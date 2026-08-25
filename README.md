# Camargos Finance

Controlo de gastos diarios da familia Camargos.

- **App:** https://tiagocamargos1.github.io/camargos-finance/
- **Backend:** Firebase (projeto `camargos-finance`, Firestore em europe-west1)
- **Login:** conta Google. So o dono apaga e administra.
- **Offline:** persistencia do Firestore — lanca sem rede e sincroniza sozinho.

## Ficheiros

| Ficheiro | O que e |
|---|---|
| `index.html` | A app inteira: markup e estilos |
| `app.js` | Logica: auth, agregado familiar, lancamentos, offline |
| `manifest.json` | PWA — nome, cores e icones (embutidos em base64) |
| `sw.js` | Service worker: arranque sem rede |

## Notas

As chaves em `app.js` nao sao segredos — sao identificadores de cliente do
Firebase. O que protege os dados sao as Security Rules do Firestore e a lista
de dominios autorizados no Firebase Auth.
