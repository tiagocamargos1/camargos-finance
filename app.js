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
  unsubscribes: [],
  // ecrã do mês
  ecra: 'lancar',
  mesRef: null,        // primeiro dia do mês que está a ser mostrado
  mesEntradas: [],     // lançamentos desse mês
  mesAnteriorCents: 0, // total do mês anterior (mês inteiro)
  mesAnteriorAteHoje: 0,
  orcamentoCents: 0,
  filtroCat: null,
  filtroDia: null,
  unsubMes: null,
  // contas fixas
  fixas: [],           // households/{hid}/recurring
  pagasMes: {},        // households/{hid}/months/{AAAA-MM}/bills
  fixEdicao: false,
  unsubFixas: null,
  unsubPagas: null
};

/* As contas fixas de CONTAS PORTUGAL, para a importação de uma vez só.
   Valores de referência de agosto/setembro 2026 — depois editam-se na app. */
const FIXAS_DA_PLANILHA = [
  ['Seguro de vida (casa)', 'Seguros', 'Ocidental', 1, 9719],
  ['Plano de saúde', 'Saúde', 'Medicare', 1, 5990],
  ['Alarme', 'Moradia', 'Horalarme', 1, 2952],
  ['Gás propano', 'Moradia', 'Galp', 1, 0],
  ['Seguro Scenic', 'Transporte', 'Ocidental', 1, 2371],
  ['Seguro vida (empréstimo)', 'Seguros', 'Ocidental', 1, 965],
  ['Colaboradora do lar', 'Serviços domésticos', 'Lucileia', 1, 130000],
  ['Doação', 'Doações', 'Unicef', 5, 2000],
  ['Pacote cliente', 'Financeiro', 'Millennium', 5, 800],
  ['Escola TJ', 'Educação', 'Andrade Corvo', 5, 0],
  ['Escola Bella', 'Educação', 'Andrade Corvo', 5, 0],
  ['Seguro Mac', 'Tecnologia', 'Fnac', 10, 2699],
  ['Empréstimo', 'Financeiro', 'Millennium', 10, 50460],
  ['Seguro de incêndio', 'Seguros', 'Ocidental', 15, 4065],
  ['Energia casa', 'Moradia', 'EDP', 15, 18227],
  ['TAP Gold Card', 'Cartões', 'Millennium', 15, 0],
  ['TAP Classic Card', 'Cartões', 'Millennium', 20, 0],
  ['Classic Card', 'Cartões', 'Millennium', 20, 0],
  ['Água casa', 'Moradia', 'Município', 20, 6485],
  ['Seguro Twingo (LU)', 'Transporte', 'Ocidental', 24, 2200],
  ['Visto Annie', 'Documentação', 'Jabour Vilalba', 25, 10000],
  ['Prestação casa', 'Moradia', 'Millennium', 25, 128367],
  ['Energia loja', 'Trabalho', 'MEO', 25, 3608],
  ['Internet fixa + móvel', 'Comunicações', 'NÓS', 28, 15769],
  ['Internet fixa sala', 'Comunicações', 'MEO', 29, 24027],
  ['Móvel work', 'Trabalho', 'MEO', 29, 1448]
];

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'];

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
  [estado.unsubMes, estado.unsubFixas, estado.unsubPagas].forEach((u) => { if (u) u(); });
  estado.unsubMes = estado.unsubFixas = estado.unsubPagas = null;
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
  estado.orcamentoCents = (hsnap.exists() && hsnap.data().monthlyBudgetCents) || 0;
  $('#casa').textContent = hsnap.exists() ? hsnap.data().name : '—';
  document.body.classList.toggle('dono', estado.souDono);

  await carregarListas();
  await carregarMembros();
  desenharCategorias();
  desenharPagamentos();
  ligarResumoDoDia();
  ligarUltimos();

  $('#tabs').classList.remove('hide');
  $('#fixDono').classList.toggle('hide', !estado.souDono);
  $('#fixAvisoMembro').classList.toggle('hide', estado.souDono);
  if (!estado.mesRef) estado.mesRef = primeiroDiaDoMes(new Date());
  ligarMes();
  ligarFixas();
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
/* Ecrã do mês                                                         */
/* ------------------------------------------------------------------ */

const COR_CAT = {
  mercado: '--g-mercado', restaurante: '--g-restaurante',
  combustivel: '--g-combustivel', compra: '--g-compra', viaverde: '--g-viaverde'
};

function primeiroDiaDoMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function mesSeguinteDe(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }
function diasNoMes(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function mesmoMes(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function nomeMes(d) { return MESES_PT[d.getMonth()] + ' ' + d.getFullYear(); }

function mostrarEcra(nome) {
  estado.ecra = nome;
  $('#ecraLancar').classList.toggle('hide', nome !== 'lancar');
  $('#ecraMes').classList.toggle('hide', nome !== 'mes');
  $('#ecraFixas').classList.toggle('hide', nome !== 'fixas');
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.ecra === nome)));
  window.scrollTo(0, 0);
}

function chaveMes(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// O dia até onde faz sentido comparar: hoje, se estamos no mês corrente.
function diaDeCorte() {
  const hoje = new Date();
  return mesmoMes(hoje, estado.mesRef) ? hoje.getDate() : diasNoMes(estado.mesRef);
}

function ligarMes() {
  if (estado.unsubMes) { estado.unsubMes(); estado.unsubMes = null; }
  estado.filtroCat = null;
  estado.filtroDia = null;

  const ini = estado.mesRef;
  const fim = mesSeguinteDe(ini);
  const q = query(
    collection(db, 'households', estado.hid, 'entries'),
    where('date', '>=', Timestamp.fromDate(ini)),
    where('date', '<', Timestamp.fromDate(fim))
  );
  estado.unsubMes = onSnapshot(q, (snap) => {
    estado.mesEntradas = [];
    snap.forEach((d) => estado.mesEntradas.push(Object.assign({ id: d.id }, d.data())));
    desenharMes();
  }, (e) => console.error('mes', e));

  carregarMesAnterior();
}

async function carregarMesAnterior() {
  const ini = new Date(estado.mesRef.getFullYear(), estado.mesRef.getMonth() - 1, 1);
  const fim = estado.mesRef;
  estado.mesAnteriorCents = 0;
  estado.mesAnteriorAteHoje = 0;
  try {
    const snap = await getDocs(query(
      collection(db, 'households', estado.hid, 'entries'),
      where('date', '>=', Timestamp.fromDate(ini)),
      where('date', '<', Timestamp.fromDate(fim))
    ));
    const corte = diaDeCorte();
    snap.forEach((d) => {
      const e = d.data();
      const c = e.amountCents || 0;
      estado.mesAnteriorCents += c;
      const dia = (e.date && e.date.toDate) ? e.date.toDate().getDate() : 1;
      if (dia <= corte) estado.mesAnteriorAteHoje += c;
    });
  } catch (err) {
    console.error('mes anterior', err);
  }
  desenharMes();
}

function barra(nome, cents, total, cor, ativo) {
  const pct = total > 0 ? Math.round((cents / total) * 100) : 0;
  const b = document.createElement('button');
  b.className = 'bar';
  b.setAttribute('aria-pressed', String(!!ativo));
  b.innerHTML =
    `<span class="top"><span class="nm">${nome}</span>` +
    `<span class="vl">${eur(cents)}</span><span class="pc">${pct}%</span></span>` +
    `<span class="trilho"><span class="fill" style="width:${total > 0 ? Math.max(pct, cents > 0 ? 2 : 0) : 0}%;background:${cor}"></span></span>`;
  return b;
}

function desenharMes() {
  if (!estado.mesRef) return;

  const ents = estado.mesEntradas;
  const diarios = ents.reduce((s, e) => s + (e.amountCents || 0), 0);
  const fx = totaisFixas();
  const total = diarios + fx.previsto;
  const pendente = ents.filter((e) => !e.paid).reduce((s, e) => s + (e.amountCents || 0), 0)
    + fx.falta;
  const corte = diaDeCorte();

  $('#mesNome').textContent = nomeMes(estado.mesRef).replace(/^./, (c) => c.toUpperCase());
  $('#mesSub').textContent = mesmoMes(new Date(), estado.mesRef)
    ? 'mês a decorrer · dia ' + corte + ' de ' + diasNoMes(estado.mesRef)
    : 'mês fechado';
  $('#mesSeg').disabled = mesmoMes(estado.mesRef, new Date());

  $('#mesTotal').textContent = eur(total);
  $('#mesDiarios').textContent = eur(diarios);
  $('#mesFixasTot').textContent = eur(fx.previsto);
  $('#mesPend').textContent = eur(pendente);
  $('#defOrc').textContent = estado.orcamentoCents
    ? 'orçamento: ' + eur(estado.orcamentoCents) + ' — alterar'
    : 'definir orçamento';
  $('#defOrc').classList.toggle('hide', !estado.souDono && !estado.orcamentoCents);

  // --- anel -------------------------------------------------------
  const VOLTA = 358;
  let fracao = 0, legenda = '';
  if (estado.orcamentoCents > 0) {
    fracao = total / estado.orcamentoCents;
    legenda = Math.round(fracao * 100) + '% de ' + eur(estado.orcamentoCents);
  } else if (estado.mesAnteriorCents > 0) {
    fracao = total / estado.mesAnteriorCents;
    legenda = Math.round(fracao * 100) + '% do mês anterior';
  } else {
    fracao = 0;
    legenda = 'sem termo de comparação';
  }
  const arco = $('#ringArco');
  arco.setAttribute('stroke-dashoffset', String(VOLTA * (1 - Math.min(fracao, 1))));
  // ritmo: onde deveríamos ir se o mês corresse a direito
  const ritmo = corte / diasNoMes(estado.mesRef);
  const dentro = fracao <= ritmo + 0.05 || fracao === 0;
  arco.style.stroke = fracao > 1 ? 'var(--erro)' : (dentro ? 'var(--ok)' : 'var(--mercado)');
  $('#mesPct').textContent = legenda;

  // --- comparação -------------------------------------------------
  const cmp = $('#mesCmp');
  const media = 'Média de <b>' + eur(corte > 0 ? Math.round(diarios / corte) : 0) +
    '</b> por dia em gastos diários. ';
  if (estado.mesAnteriorAteHoje > 0) {
    const dif = diarios - estado.mesAnteriorAteHoje;
    const pc = Math.round((dif / estado.mesAnteriorAteHoje) * 100);
    const cls = dif > 0 ? 'sobe' : 'desce';
    const seta = dif > 0 ? '▲' : '▼';
    const abertura = mesmoMes(new Date(), estado.mesRef)
      ? 'No mesmo ponto do mês passado tinhas gasto'
      : 'No mês anterior gastaste';
    cmp.innerHTML = media + `${abertura} <b>${eur(estado.mesAnteriorAteHoje)}</b>. ` +
      `Estás <span class="${cls}">${seta} ${Math.abs(pc)}%</span> (${dif > 0 ? '+' : '−'}${eur(Math.abs(dif))}).`;
  } else {
    cmp.innerHTML = media + 'Ainda não há mês anterior para comparar.';
  }

  // --- por categoria ----------------------------------------------
  const porCat = {};
  CATEGORIAS.forEach((c) => { porCat[c.id] = 0; });
  ents.forEach((e) => { porCat[e.type] = (porCat[e.type] || 0) + (e.amountCents || 0); });
  const wc = $('#mesCats');
  wc.innerHTML = '';
  CATEGORIAS.forEach((c) => {
    const b = barra(c.nome, porCat[c.id] || 0, diarios,
      `var(${COR_CAT[c.id] || '--g-neutro'})`, estado.filtroCat === c.id);
    b.onclick = () => {
      estado.filtroCat = (estado.filtroCat === c.id ? null : c.id);
      desenharMes();
    };
    wc.appendChild(b);
  });

  // --- por pessoa --------------------------------------------------
  const porPessoa = {};
  ents.forEach((e) => { porPessoa[e.who] = (porPessoa[e.who] || 0) + (e.amountCents || 0); });
  const wp = $('#mesPessoas');
  wp.innerHTML = '';
  Object.entries(porPessoa).sort((a, b) => b[1] - a[1]).forEach(([uid, c], i) => {
    const nome = (estado.membros[uid] && estado.membros[uid].displayName) || 'Sem identificação';
    wp.appendChild(barra(nome.split(' ')[0], c, diarios,
      i === 0 ? 'var(--g-p1)' : 'var(--g-p2)', false));
  });
  if (!Object.keys(porPessoa).length) wp.innerHTML = '<div class="vazio">Sem lançamentos.</div>';

  // --- dia a dia ---------------------------------------------------
  const nd = diasNoMes(estado.mesRef);
  const porDia = new Array(nd + 1).fill(0);
  ents.forEach((e) => {
    const d = (e.date && e.date.toDate) ? e.date.toDate().getDate() : 1;
    porDia[d] += (e.amountCents || 0);
  });
  const maxDia = Math.max.apply(null, porDia.concat([1]));
  const wd = $('#mesDias');
  wd.innerHTML = '';
  const hoje = new Date();
  for (let d = 1; d <= nd; d++) {
    const col = document.createElement('button');
    col.className = 'col' + (mesmoMes(hoje, estado.mesRef) && hoje.getDate() === d ? ' hoje' : '');
    col.setAttribute('aria-pressed', String(estado.filtroDia === d));
    col.setAttribute('aria-label', d + ' — ' + eur(porDia[d]));
    col.innerHTML = `<i style="height:${Math.round((porDia[d] / maxDia) * 100)}%"></i>`;
    col.onclick = () => {
      estado.filtroDia = (estado.filtroDia === d ? null : d);
      desenharMes();
    };
    wd.appendChild(col);
  }
  const eixo = $('#mesEixo');
  eixo.innerHTML = '';
  [1, 8, 15, 22, nd].forEach((d) => {
    const s = document.createElement('span');
    s.textContent = String(d);
    eixo.appendChild(s);
  });
  $('#mesDiaInfo').innerHTML = estado.filtroDia
    ? `Dia ${estado.filtroDia}: <b>${eur(porDia[estado.filtroDia])}</b> — toca outra vez para limpar.`
    : 'Toca numa barra para ver o dia.';

  // --- por método de pagamento -------------------------------------
  const porPag = {};
  ents.forEach((e) => {
    const k = e.paymentMethod || 'Sem método';
    porPag[k] = (porPag[k] || 0) + (e.amountCents || 0);
  });
  const wpg = $('#mesPags');
  wpg.innerHTML = '';
  const pags = Object.entries(porPag).sort((a, b) => b[1] - a[1]).slice(0, 6);
  pags.forEach(([k, c]) => wpg.appendChild(barra(k, c, diarios, 'var(--g-neutro)', false)));
  if (!pags.length) wpg.innerHTML = '<div class="vazio">Sem lançamentos.</div>';

  // --- lista -------------------------------------------------------
  desenharListaDoMes();
}

function desenharListaDoMes() {
  const wrap = $('#mesLista');
  wrap.innerHTML = '';

  let lista = estado.mesEntradas.slice();
  if (estado.filtroCat) lista = lista.filter((e) => e.type === estado.filtroCat);
  if (estado.filtroDia) {
    lista = lista.filter((e) => (e.date && e.date.toDate ? e.date.toDate().getDate() : 0) === estado.filtroDia);
  }
  lista.sort((a, b) => {
    const da = a.date && a.date.toMillis ? a.date.toMillis() : 0;
    const db_ = b.date && b.date.toMillis ? b.date.toMillis() : 0;
    return db_ - da;
  });

  const filtros = [];
  if (estado.filtroCat) {
    const c = CATEGORIAS.find((x) => x.id === estado.filtroCat);
    filtros.push(c ? c.nome.toLowerCase() : estado.filtroCat);
  }
  if (estado.filtroDia) filtros.push('dia ' + estado.filtroDia);
  $('#mesListaTit').textContent = filtros.length
    ? 'Lançamentos · ' + filtros.join(' · ')
    : 'Lançamentos do mês';

  if (!lista.length) {
    wrap.innerHTML = '<div class="vazio">Nada aqui. Os lançamentos aparecem assim que forem feitos.</div>';
    return;
  }

  lista.slice(0, 60).forEach((e) => {
    const cat = CATEGORIAS.find((c) => c.id === e.type);
    const quem = (estado.membros[e.who] && estado.membros[e.who].displayName) || '';
    const dt = (e.date && e.date.toDate) ? e.date.toDate() : null;
    const dia = dt ? String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') : '';
    const linha = document.createElement('div');
    linha.className = 'it';
    linha.innerHTML =
      `<span class="pt" style="background:var(${COR_CAT[e.type] || '--g-neutro'})"></span>` +
      `<span class="l">${dia} · ${(cat ? cat.nome : e.type)}${e.place ? ' · ' + e.place : ''}` +
      `<em>${quem ? quem.split(' ')[0] : ''}${e.paid ? '' : ' · pendente'}` +
      `${e.paymentMethod ? ' · ' + e.paymentMethod : ''}</em></span>` +
      `<b>${eur(e.amountCents || 0)}</b>`;
    if (estado.souDono) {
      const x = document.createElement('button');
      x.className = 'del';
      x.textContent = '×';
      x.title = 'Apagar';
      x.onclick = async () => {
        if (!confirm('Apagar este lançamento?')) return;
        try {
          await deleteDoc(doc(db, 'households', estado.hid, 'entries', e.id));
          toast('Apagado.');
        } catch (err) { toast('Não consegui apagar.', true); }
      };
      linha.appendChild(x);
    }
    wrap.appendChild(linha);
  });
}

async function definirOrcamento() {
  if (!estado.souDono) { toast('Só o dono define o orçamento.', true); return; }
  const atual = estado.orcamentoCents ? (estado.orcamentoCents / 100).toString().replace('.', ',') : '';
  const txt = prompt('Orçamento mensal em euros (deixa vazio para tirar):', atual);
  if (txt === null) return;
  const cents = paraCentimos(txt);
  try {
    await updateDoc(doc(db, 'households', estado.hid), { monthlyBudgetCents: cents });
    estado.orcamentoCents = cents;
    desenharMes();
    toast(cents ? 'Orçamento: ' + eur(cents) : 'Orçamento removido.');
  } catch (e) {
    console.error(e);
    toast('Não consegui gravar o orçamento.', true);
  }
}

/* ------------------------------------------------------------------ */
/* Contas fixas                                                        */
/* ------------------------------------------------------------------ */

function ligarFixas() {
  if (estado.unsubFixas) estado.unsubFixas();
  estado.unsubFixas = onSnapshot(
    collection(db, 'households', estado.hid, 'recurring'),
    (snap) => {
      estado.fixas = [];
      snap.forEach((d) => estado.fixas.push(Object.assign({ id: d.id }, d.data())));
      estado.fixas.sort((a, b) => (a.dueDay || 0) - (b.dueDay || 0) ||
        String(a.name).localeCompare(String(b.name), 'pt'));
      desenharFixas();
      desenharMes();
    },
    (e) => console.error('fixas', e)
  );
  ligarPagasDoMes();
}

function ligarPagasDoMes() {
  if (estado.unsubPagas) estado.unsubPagas();
  const mk = chaveMes(estado.mesRef);
  estado.unsubPagas = onSnapshot(
    collection(db, 'households', estado.hid, 'months', mk, 'bills'),
    (snap) => {
      estado.pagasMes = {};
      snap.forEach((d) => { estado.pagasMes[d.id] = d.data(); });
      desenharFixas();
      desenharMes();
    },
    (e) => console.error('pagas', e)
  );
}

// Valor da conta neste mês: o valor do mês, se tiver sido corrigido; senão o previsto.
function valorFixaNoMes(f) {
  const p = estado.pagasMes[f.id];
  if (p && typeof p.amountCents === 'number') return p.amountCents;
  return f.amountCents || 0;
}

function totaisFixas() {
  let previsto = 0, pago = 0;
  estado.fixas.forEach((f) => {
    if (f.active === false) return;
    const v = valorFixaNoMes(f);
    previsto += v;
    if (estado.pagasMes[f.id] && estado.pagasMes[f.id].paid) pago += v;
  });
  return { previsto: previsto, pago: pago, falta: previsto - pago };
}

function desenharFixas() {
  if (!estado.mesRef) return;

  $('#fixNome').textContent = nomeMes(estado.mesRef).replace(/^./, (c) => c.toUpperCase());
  $('#fixSeg').disabled = mesmoMes(estado.mesRef, new Date());

  const t = totaisFixas();
  $('#fixPrev').textContent = eur(t.previsto);
  $('#fixPago').textContent = eur(t.pago);
  $('#fixFalta').textContent = eur(t.falta);
  $('#fixBarra').style.width = (t.previsto > 0 ? Math.round((t.pago / t.previsto) * 100) : 0) + '%';
  $('#fixAux').textContent = estado.souDono
    ? (estado.fixEdicao ? 'a editar' : 'toca no valor para corrigir')
    : '';

  const wrap = $('#fixLista');
  wrap.innerHTML = '';

  const ativas = estado.fixas.filter((f) => f.active !== false);
  if (!ativas.length) {
    wrap.innerHTML = '<div class="vazio">Ainda não há contas fixas. ' +
      (estado.souDono ? 'Importa as da planilha ou acrescenta uma.' : 'Pede ao Tiago para as criar.') +
      '</div>';
    return;
  }

  let diaAtual = null;
  ativas.forEach((f) => {
    if (f.dueDay !== diaAtual) {
      diaAtual = f.dueDay;
      const h = document.createElement('div');
      h.className = 'diadia';
      h.textContent = 'Vence dia ' + (diaAtual || '—');
      wrap.appendChild(h);
    }

    const paga = !!(estado.pagasMes[f.id] && estado.pagasMes[f.id].paid);
    const valor = valorFixaNoMes(f);
    const corrigido = estado.pagasMes[f.id] && typeof estado.pagasMes[f.id].amountCents === 'number';

    const linha = document.createElement('div');
    linha.className = 'conta' + (paga ? ' paga' : '');

    const tick = document.createElement('button');
    tick.className = 'tick';
    tick.textContent = paga ? '✓' : '';
    tick.setAttribute('aria-pressed', String(paga));
    tick.setAttribute('aria-label', (paga ? 'Marcar por pagar: ' : 'Marcar como paga: ') + f.name);
    tick.disabled = !estado.souDono;
    tick.onclick = () => alternarPagoFixa(f, !paga);
    linha.appendChild(tick);

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.innerHTML = `${f.name}<em>${[f.issuer, f.category].filter(Boolean).join(' · ')}` +
      `${corrigido ? ' · valor deste mês' : ''}</em>`;
    linha.appendChild(nm);

    const vl = document.createElement('button');
    vl.className = 'vl';
    vl.textContent = eur(valor);
    vl.disabled = !estado.souDono;
    vl.onclick = () => corrigirValorDoMes(f);
    linha.appendChild(vl);

    if (estado.souDono) {
      const ed = document.createElement('button');
      ed.className = 'ed';
      ed.textContent = '⋯';
      ed.title = 'Editar conta fixa';
      ed.onclick = () => editarContaFixa(f);
      linha.appendChild(ed);
    }

    wrap.appendChild(linha);
  });
}

async function alternarPagoFixa(f, paga) {
  if (!estado.souDono) { toast('Só o dono marca as contas fixas.', true); return; }
  const mk = chaveMes(estado.mesRef);
  try {
    await setDoc(doc(db, 'households', estado.hid, 'months', mk, 'bills', f.id), {
      paid: paga, paidAt: paga ? serverTimestamp() : null, updatedAt: serverTimestamp()
    }, { merge: true });
    // o documento do mês tem de existir para a subcoleção aparecer na consola
    await setDoc(doc(db, 'households', estado.hid, 'months', mk), { mes: mk }, { merge: true });
  } catch (e) {
    console.error(e);
    toast('Não consegui gravar.', true);
  }
}

async function corrigirValorDoMes(f) {
  if (!estado.souDono) return;
  const atual = (valorFixaNoMes(f) / 100).toFixed(2).replace('.', ',');
  const txt = prompt(`Valor de «${f.name}» em ${nomeMes(estado.mesRef)}\n` +
    '(deixa vazio para voltar ao valor previsto)', atual);
  if (txt === null) return;
  const mk = chaveMes(estado.mesRef);
  try {
    await setDoc(doc(db, 'households', estado.hid, 'months', mk, 'bills', f.id), {
      amountCents: txt.trim() === '' ? null : paraCentimos(txt), updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error(e);
    toast('Não consegui gravar.', true);
  }
}

async function editarContaFixa(f) {
  if (!estado.souDono) return;
  const nome = prompt('Nome da conta (vazio = apagar esta conta fixa):', f.name);
  if (nome === null) return;
  if (nome.trim() === '') {
    if (!confirm(`Apagar «${f.name}» de todos os meses?`)) return;
    try { await deleteDoc(doc(db, 'households', estado.hid, 'recurring', f.id)); toast('Apagada.'); }
    catch (e) { toast('Não consegui apagar.', true); }
    return;
  }
  const valor = prompt('Valor previsto por mês, em euros:',
    (f.amountCents / 100).toFixed(2).replace('.', ','));
  if (valor === null) return;
  const dia = prompt('Dia de vencimento (1 a 31):', String(f.dueDay || 1));
  if (dia === null) return;
  try {
    await updateDoc(doc(db, 'households', estado.hid, 'recurring', f.id), {
      name: nome.trim(),
      amountCents: paraCentimos(valor),
      dueDay: Math.min(31, Math.max(1, parseInt(dia, 10) || 1)),
      updatedAt: serverTimestamp()
    });
    toast('Atualizada.');
  } catch (e) {
    console.error(e);
    toast('Não consegui gravar.', true);
  }
}

async function novaContaFixa() {
  if (!estado.souDono) return;
  const nome = prompt('Nome da conta fixa:');
  if (!nome || !nome.trim()) return;
  const valor = prompt('Valor previsto por mês, em euros:', '0,00');
  if (valor === null) return;
  const dia = prompt('Dia de vencimento (1 a 31):', '1');
  if (dia === null) return;
  const emissor = prompt('Emissor (opcional):', '') || '';
  try {
    await addDoc(collection(db, 'households', estado.hid, 'recurring'), {
      name: nome.trim(),
      category: '',
      issuer: emissor.trim(),
      dueDay: Math.min(31, Math.max(1, parseInt(dia, 10) || 1)),
      amountCents: paraCentimos(valor),
      active: true,
      createdAt: serverTimestamp()
    });
    toast('Conta fixa criada.');
  } catch (e) {
    console.error(e);
    toast('Não consegui criar.', true);
  }
}

async function importarFixasDaPlanilha() {
  if (!estado.souDono) return;
  if (estado.fixas.length) {
    toast('Já existem contas fixas — apaga-as primeiro.', true);
    return;
  }
  const total = FIXAS_DA_PLANILHA.reduce((s, f) => s + f[4], 0);
  if (!confirm(`Importar ${FIXAS_DA_PLANILHA.length} contas fixas da planilha ` +
    `(${eur(total)} por mês)?\n\nDepois podes editar cada uma aqui.`)) return;
  try {
    for (const [name, category, issuer, dueDay, amountCents] of FIXAS_DA_PLANILHA) {
      await addDoc(collection(db, 'households', estado.hid, 'recurring'), {
        name: name, category: category, issuer: issuer, dueDay: dueDay,
        amountCents: amountCents, active: true, createdAt: serverTimestamp()
      });
    }
    toast('Importadas ' + FIXAS_DA_PLANILHA.length + ' contas fixas.');
  } catch (e) {
    console.error(e);
    toast('Não consegui importar: ' + (e.code || e.message), true);
  }
}

function mudarMes(delta) {
  const novo = new Date(estado.mesRef.getFullYear(), estado.mesRef.getMonth() + delta, 1);
  if (novo > primeiroDiaDoMes(new Date())) return;
  estado.mesRef = novo;
  estado.mesEntradas = [];
  estado.pagasMes = {};
  desenharMes();
  desenharFixas();
  ligarMes();
  ligarPagasDoMes();
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

  $$('#tabs button').forEach((b) => { b.onclick = () => mostrarEcra(b.dataset.ecra); });
  $('#mesAnt').onclick = () => mudarMes(-1);
  $('#mesSeg').onclick = () => mudarMes(1);
  $('#fixAnt').onclick = () => mudarMes(-1);
  $('#fixSeg').onclick = () => mudarMes(1);
  $('#defOrc').onclick = definirOrcamento;
  $('#fixNova').onclick = novaContaFixa;
  $('#fixImportar').onclick = importarFixasDaPlanilha;

  const ecraInicial = new URLSearchParams(location.search).get('ecra');
  if (ecraInicial === 'mes' || ecraInicial === 'fixas') mostrarEcra(ecraInicial);

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
