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
  unsubMes: null
};

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
  if (!estado.mesRef) estado.mesRef = primeiroDiaDoMes(new Date());
  ligarMes();
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
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.ecra === nome)));
  window.scrollTo(0, 0);
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
  const total = ents.reduce((s, e) => s + (e.amountCents || 0), 0);
  const pendente = ents.filter((e) => !e.paid).reduce((s, e) => s + (e.amountCents || 0), 0);
  const corte = diaDeCorte();

  $('#mesNome').textContent = nomeMes(estado.mesRef).replace(/^./, (c) => c.toUpperCase());
  $('#mesSub').textContent = mesmoMes(new Date(), estado.mesRef)
    ? 'mês a decorrer · dia ' + corte + ' de ' + diasNoMes(estado.mesRef)
    : 'mês fechado';
  $('#mesSeg').disabled = mesmoMes(estado.mesRef, new Date());

  $('#mesTotal').textContent = eur(total);
  $('#mesPend').textContent = eur(pendente);
  $('#mesMedia').textContent = eur(corte > 0 ? Math.round(total / corte) : 0);
  $('#mesN').textContent = String(ents.length);
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
  if (estado.mesAnteriorAteHoje > 0) {
    const dif = total - estado.mesAnteriorAteHoje;
    const pc = Math.round((dif / estado.mesAnteriorAteHoje) * 100);
    const cls = dif > 0 ? 'sobe' : 'desce';
    const seta = dif > 0 ? '▲' : '▼';
    const abertura = mesmoMes(new Date(), estado.mesRef)
      ? 'No mesmo ponto do mês passado tinhas gasto'
      : 'No mês anterior gastaste';
    cmp.innerHTML = `${abertura} <b>${eur(estado.mesAnteriorAteHoje)}</b>. ` +
      `Estás <span class="${cls}">${seta} ${Math.abs(pc)}%</span> (${dif > 0 ? '+' : '−'}${eur(Math.abs(dif))}).`;
  } else {
    cmp.textContent = 'Ainda não há mês anterior para comparar.';
  }

  // --- por categoria ----------------------------------------------
  const porCat = {};
  CATEGORIAS.forEach((c) => { porCat[c.id] = 0; });
  ents.forEach((e) => { porCat[e.type] = (porCat[e.type] || 0) + (e.amountCents || 0); });
  const wc = $('#mesCats');
  wc.innerHTML = '';
  CATEGORIAS.forEach((c) => {
    const b = barra(c.nome, porCat[c.id] || 0, total,
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
    wp.appendChild(barra(nome.split(' ')[0], c, total,
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
  pags.forEach(([k, c]) => wpg.appendChild(barra(k, c, total, 'var(--g-neutro)', false)));
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

function mudarMes(delta) {
  const novo = new Date(estado.mesRef.getFullYear(), estado.mesRef.getMonth() + delta, 1);
  if (novo > primeiroDiaDoMes(new Date())) return;
  estado.mesRef = novo;
  estado.mesEntradas = [];
  desenharMes();
  ligarMes();
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
  $('#defOrc').onclick = definirOrcamento;

  const ecraInicial = new URLSearchParams(location.search).get('ecra');
  if (ecraInicial === 'mes') mostrarEcra('mes');

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
