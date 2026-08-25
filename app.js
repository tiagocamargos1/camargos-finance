/* --------------------------------------------------------------------
   Configuração pública do Firebase.
   Estas chaves NÃO são segredos — são identificadores de cliente, e o
   Google documenta-as como seguras para ficar no código do browser.
   O que protege os dados é: (1) a lista de domínios autorizados no
   Firebase Auth e (2) as Security Rules do Firestore. Sem login válido,
   isto não lê uma linha.
   -------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCQ6W5sISAyfZYq1LPjh4M45bBsxH3NLsg",
  authDomain: "camargos-finance.firebaseapp.com",
  projectId: "camargos-finance",
  storageBucket: "camargos-finance.firebasestorage.app",
  messagingSenderId: "356888104453",
  appId: "1:356888104453:web:9fb1cb087d7b6c286cd66c"
};

// Quem é o dono da casa. Só este email pode apagar e administrar.
const OWNER_EMAIL = "tiagocamargos@tocsmartgroup.com";

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query,
  where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Persistência offline: é isto que faz a app funcionar na cave do supermercado.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const CATEGORIAS = [
  { id: 'mercado',      nome: 'MERCADO',      cor: '--mercado',      onde: 'Mercado',       extra: 'Categoria' },
  { id: 'restaurante',  nome: 'RESTAURANTES', cor: '--restaurantes', onde: 'Restaurante',   extra: 'Tipo' },
  { id: 'combustivel',  nome: 'COMBUSTÍVEL',  cor: '--combustivel',  onde: 'Posto',         extra: 'Veículo' },
  { id: 'compra',       nome: 'COMPRAS',      cor: '--compras',      onde: 'Loja',          extra: 'Categoria' },
  { id: 'viaverde',     nome: 'VIA VERDE',    cor: '--viaverde',     onde: 'Local / percurso', extra: 'Tipo' }
];

const LISTAS_INICIAIS = {
  mercado_onde: ['Continente', 'Pingo Doce', 'Lidl', 'Aldi', 'Auchan', 'Intermarché', 'Mercadona', 'Minipreço', 'Mercado local', 'Outro'],
  mercado_extra: ['Alimentação', 'Bebidas', 'Limpeza', 'Higiene', 'Casa', 'Animais', 'Outro'],
  restaurante_onde: [],
  restaurante_extra: ['Pequeno-almoço', 'Almoço', 'Jantar', 'Café / Lanche', 'Take-away', 'Delivery', 'Outro'],
  combustivel_onde: ['Galp', 'BP', 'Repsol', 'Cepsa', 'Prio', 'Intermarché', 'Continente', 'Auchan', 'Outro'],
  combustivel_extra: ['Mercedes Classe A', 'Renault Grand Scenic', 'Renault Clio 22-27-VT', 'Renault Clio 91-29-TB', 'Renault Kangoo', 'Opel Corsa'],
  compra_onde: [],
  compra_extra: ['Vestuário', 'Casa', 'Saúde / Farmácia', 'Lazer', 'Eletrónica', 'Presentes', 'Outro'],
  viaverde_onde: [],
  viaverde_extra: ['Portagem', 'Parque de estacionamento', 'Abastecimento', 'Área de serviço', 'Outro'],
  pagamentos: ['Dinheiro', 'MB Way', 'Multibanco (Débito)', 'TAP Gold Card', 'TAP Classic Card', 'Classic Card', 'Transferência', 'Débito direto', 'Outro']
};

let estado = {
  user: null,
  hid: null,
  souDono: false,
  categoria: 'mercado',
  pagamento: null,
  listas: {},
  membros: {},
  unsubscribes: []
};

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const eur = (cents) => (cents / 100).toLocaleString('pt-PT', {
  style: 'currency', currency: 'EUR'
});

function paraCentimos(txt) {
  if (!txt) return 0;
  const limpo = String(txt).replace(/[^0-9,.-]/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function inicioDoDia(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function hojeISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function toast(msg, erro) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (erro ? ' err' : '');
  setTimeout(() => { t.className = 'toast'; }, 2600);
}

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

async function entrar() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // Safari e WebViews bloqueiam popups — cai para redirect.
    if (String(e.code).indexOf('popup') >= 0 || String(e.code).indexOf('cancelled') >= 0) {
      await signInWithRedirect(auth, provider);
    } else {
      toast('Não consegui entrar: ' + (e.code || e.message), true);
      console.error(e);
    }
  }
}

getRedirectResult(auth).catch((e) => console.error('redirect', e));

onAuthStateChanged(auth, async (user) => {
  estado.unsubscribes.forEach((u) => u());
  estado.unsubscribes = [];
  estado.user = user;
  if (!user) {
    $('#gate').classList.remove('hide');
    $('#app').classList.add('hide');
    return;
  }
  $('#gate').classList.add('hide');
  $('#app').classList.remove('hide');
  // o cabecalho mostra o nome da casa e o avatar; nao existe elemento #eu
  if (user.photoURL) { $('#avatar').src = user.photoURL; $('#avatar').classList.remove('hide'); }
  await arrancarAgregado(user);
});

/* ------------------------------------------------------------------ */
/* Agregado familiar                                                   */
/* ------------------------------------------------------------------ */

async function arrancarAgregado(user) {
  const uref = doc(db, 'users', user.uid);
  const usnap = await getDoc(uref);

  let hid = usnap.exists() ? usnap.data().defaultHouseholdId : null;

  if (!hid) {
    if ((user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      hid = await criarCasa(user);
    } else {
      hid = await aceitarConvite(user);
      if (!hid) {
        $('#semCasa').classList.remove('hide');
        $('#formWrap').classList.add('hide');
        return;
      }
    }
    await setDoc(uref, {
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      defaultHouseholdId: hid,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  estado.hid = hid;
  const hsnap = await getDoc(doc(db, 'households', hid));
  estado.souDono = hsnap.exists() && hsnap.data().ownerUid === user.uid;
  $('#casa').textContent = hsnap.exists() ? hsnap.data().name : '—';
  document.body.classList.toggle('dono', estado.souDono);

  await carregarListas();
  await carregarMembros();
  desenharCategorias();
  desenharPagamentos();
  ligarResumoDoDia();
  ligarUltimos();
}

async function criarCasa(user) {
  const ref = await addDoc(collection(db, 'households'), {
    name: 'Família Camargos',
    ownerUid: user.uid,
    currency: 'EUR',
    timezone: 'Europe/Lisbon',
    createdAt: serverTimestamp()
  });
  await setDoc(doc(db, 'households', ref.id, 'members', user.uid), {
    role: 'owner',
    displayName: user.displayName || '',
    email: user.email || '',
    joinedAt: serverTimestamp()
  });
  for (const [k, v] of Object.entries(LISTAS_INICIAIS)) {
    await setDoc(doc(db, 'households', ref.id, 'lists', k), { values: v });
  }
  return ref.id;
}

// Um convidado só entra se existir um convite com o id igual ao email dele.
// É isto que as Security Rules exigem.
async function aceitarConvite(user) {
  const email = (user.email || '').toLowerCase();
  if (!email) return null;
  const casas = await getDocs(collection(db, 'households'));
  for (const h of casas.docs) {
    const inv = await getDoc(doc(db, 'households', h.id, 'invites', email));
    if (inv.exists()) {
      await setDoc(doc(db, 'households', h.id, 'members', user.uid), {
        role: 'member',
        displayName: user.displayName || '',
        email: email,
        joinedAt: serverTimestamp()
      });
      return h.id;
    }
  }
  return null;
}

async function carregarListas() {
  const snap = await getDocs(collection(db, 'households', estado.hid, 'lists'));
  estado.listas = {};
  snap.forEach((d) => { estado.listas[d.id] = d.data().values || []; });
}

async function carregarMembros() {
  const snap = await getDocs(collection(db, 'households', estado.hid, 'members'));
  estado.membros = {};
  snap.forEach((d) => { estado.membros[d.id] = d.data(); });
}

/* ------------------------------------------------------------------ */
/* Interface do formulário                                             */
/* ------------------------------------------------------------------ */

function desenharCategorias() {
  const wrap = $('#cats');
  wrap.innerHTML = '';
  CATEGORIAS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = c.nome;
    b.dataset.id = c.id;
    b.setAttribute('aria-pressed', String(c.id === estado.categoria));
    b.onclick = () => { estado.categoria = c.id; desenharCategorias(); aplicarCategoria(); };
    wrap.appendChild(b);
  });
  aplicarCategoria();
}

function aplicarCategoria() {
  const c = CATEGORIAS.find((x) => x.id === estado.categoria);
  document.documentElement.style.setProperty('--accent', `var(${c.cor})`);
  $('#lblOnde').textContent = c.onde.toUpperCase();
  $('#onde').placeholder = c.onde;
  $('#lblExtra').textContent = c.extra.toUpperCase();

  const opts = estado.listas[`${c.id}_extra`] || [];
  $('#extra').innerHTML = '<option value="">—</option>' +
    opts.map((o) => `<option>${o}</option>`).join('');

  const ondes = estado.listas[`${c.id}_onde`] || [];
  $('#ondeList').innerHTML = ondes.map((o) => `<option value="${o}">`).join('');

  $('#litrosWrap').classList.toggle('hide', c.id !== 'combustivel');
  $('#pessoasWrap').classList.toggle('hide', c.id !== 'restaurante');
}

function desenharPagamentos() {
  const wrap = $('#pags');
  wrap.innerHTML = '';
  (estado.listas.pagamentos || LISTAS_INICIAIS.pagamentos).forEach((p) => {
    const b = document.createElement('button');
    b.className = 'chip sm';
    b.textContent = p;
    b.setAttribute('aria-pressed', String(p === estado.pagamento));
    b.onclick = () => { estado.pagamento = (estado.pagamento === p ? null : p); desenharPagamentos(); };
    wrap.appendChild(b);
  });
}

/* ------------------------------------------------------------------ */
/* Gravar                                                              */
/* ------------------------------------------------------------------ */

async function guardar() {
  const cents = paraCentimos($('#valor').value);
  if (!cents) { toast('Falta o valor.', true); $('#valor').focus(); return; }
  if (!estado.hid) { toast('Ainda não tens agregado.', true); return; }

  const dataStr = $('#data').value || hojeISO();
  const [y, m, d] = dataStr.split('-').map(Number);
  const quando = inicioDoDia(new Date(y, m - 1, d));

  const registo = {
    type: estado.categoria,
    date: Timestamp.fromDate(quando),
    amountCents: cents,
    paid: $('#pago').checked,
    who: estado.user.uid,
    place: $('#onde').value.trim(),
    category: $('#extra').value || '',
    paymentMethod: estado.pagamento || '',
    note: $('#nota').value.trim(),
    meta: {},
    source: 'app',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const litros = parseFloat(($('#litros').value || '').replace(',', '.'));
  if (!isNaN(litros)) registo.meta.liters = litros;
  const pessoas = parseInt($('#pessoas').value, 10);
  if (!isNaN(pessoas)) registo.meta.people = pessoas;

  const btn = $('#guardar');
  btn.disabled = true;
  try {
    // Sem rede, isto resolve na mesma: o Firestore guarda localmente
    // e sincroniza sozinho quando a ligação voltar.
    addDoc(collection(db, 'households', estado.hid, 'entries'), registo);
    limparForm();
    toast('Lançado — ' + eur(cents));
  } catch (e) {
    console.error(e);
    toast('Não consegui gravar: ' + (e.code || e.message), true);
  } finally {
    btn.disabled = false;
  }
}

function limparForm() {
  $('#valor').value = '';
  $('#onde').value = '';
  $('#extra').value = '';
  $('#nota').value = '';
  $('#litros').value = '';
  $('#pessoas').value = '';
  $('#pago').checked = true;
  $('#valor').focus();
}

/* ------------------------------------------------------------------ */
/* Resumo do dia e últimos lançamentos                                 */
/* ------------------------------------------------------------------ */

function ligarResumoDoDia() {
  const ini = Timestamp.fromDate(inicioDoDia(new Date()));
  const q = query(
    collection(db, 'households', estado.hid, 'entries'),
    where('date', '>=', ini)
  );
  const un = onSnapshot(q, (snap) => {
    let total = 0;
    const porPessoa = {};
    snap.forEach((d) => {
      const e = d.data();
      total += e.amountCents || 0;
      porPessoa[e.who] = (porPessoa[e.who] || 0) + (e.amountCents || 0);
    });
    $('#totalHoje').textContent = eur(total);
    const partes = Object.entries(porPessoa).map(([uid, c]) => {
      const nome = (estado.membros[uid] && estado.membros[uid].displayName) || 'Alguém';
      return `${nome.split(' ')[0]} ${eur(c)}`;
    });
    $('#split').textContent = partes.join('  ·  ');
  }, (e) => console.error('resumo', e));
  estado.unsubscribes.push(un);
}

function ligarUltimos() {
  const q = query(
    collection(db, 'households', estado.hid, 'entries'),
    orderBy('date', 'desc'), limit(12)
  );
  const un = onSnapshot(q, (snap) => {
    const wrap = $('#hist');
    wrap.innerHTML = '';
    snap.forEach((d) => {
      const e = d.data();
      const cat = CATEGORIAS.find((c) => c.id === e.type);
      const quem = (estado.membros[e.who] && estado.membros[e.who].displayName) || '';
      const linha = document.createElement('div');
      linha.className = 'it';
      linha.innerHTML =
        `<span class="l">${(cat ? cat.nome : e.type)}${e.place ? ' · ' + e.place : ''}` +
        `<em>${quem ? quem.split(' ')[0] : ''}${e.paid ? '' : ' · pendente'}</em></span>` +
        `<b>${eur(e.amountCents || 0)}</b>`;
      if (estado.souDono) {
        const x = document.createElement('button');
        x.className = 'del';
        x.textContent = '×';
        x.title = 'Apagar';
        x.onclick = async () => {
          if (!confirm('Apagar este lançamento?')) return;
          try {
            await deleteDoc(doc(db, 'households', estado.hid, 'entries', d.id));
            toast('Apagado.');
          } catch (err) { toast('Não consegui apagar.', true); }
        };
        linha.appendChild(x);
      }
      wrap.appendChild(linha);
    });
  }, (e) => console.error('hist', e));
  estado.unsubscribes.push(un);
}

/* ------------------------------------------------------------------ */
/* Ligações                                                            */
/* ------------------------------------------------------------------ */

window.addEventListener('DOMContentLoaded', () => {
  $('#data').value = hojeISO();
  $('#entrar').onclick = entrar;
  $('#guardar').onclick = guardar;
  $('#sair').onclick = () => signOut(auth);
  $('#valor').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });

  const rede = () => {
    $('#offline').classList.toggle('hide', navigator.onLine);
  };
  window.addEventListener('online', rede);
  window.addEventListener('offline', rede);
  rede();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!window.__recarregado) { window.__recarregado = true; location.reload(); }
    });
  }
});
