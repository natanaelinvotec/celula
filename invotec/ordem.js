// =====================================================================
//  Gerador de O.S. Invotec — lógica do app
//  Firebase: Auth (e-mail/senha) + Firestore (O.S., imagens, perfil)
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail,
         setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, writeBatch, serverTimestamp }
         from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig, EMPRESA, EQUIPAMENTOS, TIPOS_SERVICO, TEXTOS_PRONTOS } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const IMG_W = 360, IMG_H = 504, IMG_MIN = 1, IMG_MAX = 10; // retrato 360x504, paisagem 504x360

// --------------------------------------------------------------- utilidades
function toast(msg, err = false) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 2800);
}
function loading(on, msg = "Carregando…") { const l = $("#loading"); l.textContent = msg; l.hidden = !on; }
function confirmar(titulo, texto, okLabel = "Confirmar", danger = false) {
  return new Promise(res => {
    const root = $("#modal-root");
    root.innerHTML = `<div class="overlay"><div class="modal"><h3>${titulo}</h3><p>${texto}</p>
      <div class="row"><button class="btn" data-no>Cancelar</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${okLabel}</button></div></div></div>`;
    root.querySelector("[data-no]").onclick = () => { root.innerHTML = ""; res(false); };
    root.querySelector("[data-ok]").onclick = () => { root.innerHTML = ""; res(true); };
  });
}
const pad = n => String(n).padStart(2, "0");
function fmtData(iso) { if (!iso) return ""; const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; }
function fmtDataHora(v) { if (!v) return ""; const [d, h] = v.split("T"); return `${fmtData(d)} ${h?.slice(0, 5) || ""}`; }
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function agoraLocal() { const d = new Date(); return `${hojeISO()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chipCls = { "Preventiva Anual": "ok", "Manutenção": "warn", "Troca de periférico": "troca" };

function mostrar(tela) { $$("section[id^=tela-]").forEach(s => s.hidden = s.id !== "tela-" + tela); window.scrollTo({ top: 0 }); }

// --------------------------------------------------------------- login
let usuario = null, perfil = { nome: "", assinatura: "" };
await setPersistence(auth, browserLocalPersistence);
if (firebaseConfig.apiKey === "COLE_AQUI") {
  mostrar("login"); const e = $("#login-erro"); e.hidden = false;
  e.textContent = "O arquivo firebase-config.js ainda não foi preenchido. Veja o LEIA-ME-ORDEM.md.";
}
$("#form-login").addEventListener("submit", async ev => {
  ev.preventDefault(); const e = $("#login-erro"); e.hidden = true; $("#btn-entrar").disabled = true;
  try { await signInWithEmailAndPassword(auth, $("#l-email").value.trim(), $("#l-pass").value); }
  catch (err) {
    e.hidden = false;
    e.textContent = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(err.code) ? "E-mail ou senha incorretos."
      : /too-many-requests/.test(err.code) ? "Muitas tentativas. Aguarde alguns minutos." : "Falha ao entrar: " + err.code;
  }
  $("#btn-entrar").disabled = false;
});
$("#btn-esqueci").onclick = async () => {
  const email = $("#l-email").value.trim(); if (!email) return toast("Digite seu e-mail primeiro.", true);
  try { await sendPasswordResetEmail(auth, email); toast("E-mail de redefinição enviado."); } catch (err) { toast("Não foi possível enviar: " + err.code, true); }
};
$("#btn-sair").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  usuario = u;
  if (!u) { mostrar("login"); return; }
  $("#user-nome").textContent = u.email;
  try { const p = await getDoc(doc(db, "perfil", u.uid)); if (p.exists()) perfil = { ...perfil, ...p.data() }; } catch { }
  await carregarPainel(); mostrar("painel");
});

// --------------------------------------------------------------- painel
let ordens = [];
async function carregarPainel() {
  loading(true);
  try {
    const snap = await getDocs(collection(db, "ordens"));
    ordens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    ordens.sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.numeroOrd - a.numeroOrd));
    const cli = $("#f-cli"), tipo = $("#f-tipo");
    cli.innerHTML = '<option value="">Todos</option>' + [...new Set(ordens.map(o => o.cliente?.nome).filter(Boolean))].sort().map(c => `<option>${esc(c)}</option>`).join("");
    tipo.innerHTML = '<option value="">Todos</option>' + TIPOS_SERVICO.map(t => `<option>${esc(t)}</option>`).join("");
    const mes = hojeISO().slice(0, 7);
    $("#st-total").textContent = ordens.length;
    $("#st-mes").textContent = ordens.filter(o => (o.data || "").startsWith(mes)).length;
    $("#st-prev").textContent = ordens.filter(o => o.tipo === "Preventiva Anual").length;
    $("#st-cli").textContent = new Set(ordens.map(o => o.cliente?.nome)).size;
    renderLista();
  } catch (err) { toast("Erro ao carregar O.S.: " + err.message, true); console.error(err); }
  loading(false);
}
function filtradas() {
  const q = $("#f-q").value.trim().toLowerCase(), cli = $("#f-cli").value, tipo = $("#f-tipo").value, de = $("#f-de").value, ate = $("#f-ate").value;
  return ordens.filter(o =>
    (!q || [o.numero, o.equipamento, o.cliente?.nome, o.cliente?.local, o.tipo].join(" ").toLowerCase().includes(q)) &&
    (!cli || o.cliente?.nome === cli) && (!tipo || o.tipo === tipo) &&
    (!de || (o.data || "") >= de) && (!ate || (o.data || "") <= ate));
}
function renderLista() {
  const lista = filtradas();
  const acoes = o => `<button class="btn sm" data-ver="${o.id}">Ver / PDF</button><button class="btn sm" data-editar="${o.id}">Editar</button><button class="btn sm ghost" data-dup="${o.id}">Duplicar</button><button class="btn sm ghost" data-del="${o.id}" title="Excluir">🗑</button>`;
  $("#rows").innerHTML = lista.length ? lista.map(o => `<tr><td class="num">${esc(o.numero)}</td><td>${fmtData(o.data)}</td><td>${esc(o.cliente?.nome)}</td><td>${esc(o.equipamento)}</td>
    <td><span class="chip ${chipCls[o.tipo] || ""}">${esc(o.tipo)}</span></td><td>${o.qtdImagens ?? 0}</td><td class="actions">${acoes(o)}</td></tr>`).join("")
    : `<tr><td colspan="7" class="vazio">Nenhuma O.S. encontrada.</td></tr>`;
  $("#cards").innerHTML = lista.length ? lista.map(o => `<div class="card-os"><div class="row"><span style="font-weight:800;color:var(--brand-dark)">O.S. ${esc(o.numero)}</span><span class="chip ${chipCls[o.tipo] || ""}">${esc(o.tipo)}</span></div>
    <div>${esc(o.cliente?.nome)} · ${fmtData(o.data)}</div><div class="eq">${esc(o.equipamento)} · ${o.qtdImagens ?? 0} fotos</div><div class="row actions" style="margin-top:6px">${acoes(o)}</div></div>`).join("")
    : `<div class="vazio">Nenhuma O.S. encontrada.</div>`;
}
["#f-q", "#f-cli", "#f-tipo", "#f-de", "#f-ate"].forEach(s => $(s).addEventListener("input", renderLista));
$("#btn-limpar").onclick = () => { ["#f-q", "#f-cli", "#f-tipo", "#f-de", "#f-ate"].forEach(s => $(s).value = ""); renderLista(); };
$$("[data-nova]").forEach(b => b.onclick = () => abrirWizard(null));
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-ver],[data-editar],[data-dup],[data-del]"); if (!b) return;
  if (b.dataset.ver) { const o = await carregarCompleta(b.dataset.ver); if (o) { os = o; modoEdicao = o.id; renderDoc(); mostrar("preview"); } }
  if (b.dataset.editar) { const o = await carregarCompleta(b.dataset.editar); if (o) abrirWizard(o, false); }
  if (b.dataset.dup) { const o = await carregarCompleta(b.dataset.dup); if (o) abrirWizard(o, true); }
  if (b.dataset.del) {
    const o = ordens.find(x => x.id === b.dataset.del);
    if (await confirmar("Excluir O.S. " + o.numero + "?", "A ordem e suas imagens serão apagadas definitivamente.", "Excluir", true)) {
      loading(true, "Excluindo…"); try { await excluirOS(o.id); toast("O.S. excluída."); await carregarPainel(); } catch (err) { toast("Erro: " + err.message, true); } loading(false);
    }
  }
});
async function carregarCompleta(id) {
  loading(true);
  try {
    const d = await getDoc(doc(db, "ordens", id)); if (!d.exists()) throw new Error("O.S. não encontrada");
    const imgs = await getDocs(collection(db, "ordens", id, "imagens"));
    const o = { id, ...d.data(), imagens: imgs.docs.map(x => x.data()).sort((a, b) => a.ordem - b.ordem) };
    loading(false); return o;
  } catch (err) { loading(false); toast("Erro: " + err.message, true); return null; }
}
async function excluirOS(id) {
  const imgs = await getDocs(collection(db, "ordens", id, "imagens"));
  const batch = writeBatch(db); imgs.docs.forEach(x => batch.delete(x.ref)); batch.delete(doc(db, "ordens", id)); await batch.commit();
}

// --------------------------------------------------------------- assistente
const NAMES = ["Nº da O.S.", "Equipamento", "Tipo de serviço", "Descrição", "Imagens de prova", "Etapas do reparo", "Assinaturas"];
let step = 1, os = null, modoEdicao = null; // modoEdicao = id original quando editando

function novaOS() {
  return { numero: "", data: hojeISO(), atendente: EMPRESA.atendentePadrao, equipamento: "", cliente: null, tipo: TIPOS_SERVICO[0], descricao: "",
    imagens: [], etapas: { recebido: "", chegada: "", concluido: "" }, tecnico: perfil.nome || EMPRESA.tecnicoPadrao, clienteAssinante: "",
    assinaturas: { tec: perfil.assinatura || "", cli: "" } };
}
function abrirWizard(existente, duplicar = false) {
  if (existente) {
    os = JSON.parse(JSON.stringify(existente)); delete os.id;
    if (duplicar) { os.numero = ""; os.data = hojeISO(); os.imagens = []; os.etapas = { recebido: "", chegada: "", concluido: "" }; os.assinaturas.cli = ""; modoEdicao = null; }
    else modoEdicao = existente.id || null;
  } else { os = novaOS(); modoEdicao = null; }
  $("#wiz-title").textContent = modoEdicao ? "Editar O.S. " + os.numero : "Nova Ordem de Serviço";
  // passo 1
  $("#w-num").value = os.numero; $("#w-data").value = os.data; $("#w-atendente").value = os.atendente; $("#num-hint").textContent = "";
  // passo 2
  $("#eqs").innerHTML = EQUIPAMENTOS.map((e, i) => `<label class="radio ${e.eq === os.equipamento ? "sel" : ""}"><input type="radio" name="eq" value="${i}" ${e.eq === os.equipamento ? "checked" : ""}><div><b>${esc(e.eq)}</b><span>${esc(e.cliente)}</span></div></label>`).join("");
  $$("#eqs input").forEach(r => r.onchange = () => escolherEq(+r.value));
  if (os.cliente) mostrarAutofill(); else $("#autofill").innerHTML = "<span class='k'>Selecione o equipamento acima.</span>";
  // passo 3
  $("#tipos").innerHTML = TIPOS_SERVICO.map(t => `<label class="radio ${t === os.tipo ? "sel" : ""}"><input type="radio" name="tipo" value="${esc(t)}" ${t === os.tipo ? "checked" : ""}><div><b>${esc(t)}</b></div></label>`).join("");
  $$("#tipos input").forEach(r => r.onchange = () => { os.tipo = r.value; $$("#tipos .radio").forEach(l => l.classList.toggle("sel", l.contains(r))); });
  // passo 4
  $("#w-modelo").innerHTML = '<option value="">— Selecionar texto pronto —</option>' + TEXTOS_PRONTOS.map(t => `<option value="${t.id}">${esc(t.titulo)}</option>`).join("") + '<option value="livre">Escrever do zero</option>';
  $("#w-desc").value = os.descricao;
  // passo 5
  renderImgs();
  // passo 6
  $("#d1").value = os.etapas.recebido; $("#d2").value = os.etapas.chegada; $("#d3").value = os.etapas.concluido;
  // passo 7
  $("#w-tec-nome").value = os.tecnico; $("#w-cli-ass").value = os.clienteAssinante;
  sigs.tec.set(os.assinaturas.tec); sigs.cli.set(os.assinaturas.cli);
  setStep(1); mostrar("wizard");
}
function escolherEq(i) {
  const e = EQUIPAMENTOS[i]; os.equipamento = e.eq; os.cliente = { nome: e.cliente, endereco: e.endereco, telefone: e.telefone, local: e.local, cnpj: e.cnpj };
  $$("#eqs .radio").forEach((l, j) => l.classList.toggle("sel", j === i)); mostrarAutofill();
}
function mostrarAutofill() {
  const c = os.cliente;
  $("#autofill").innerHTML = `<div><span class="k">Cliente:</span> ${esc(c.nome)}</div><div><span class="k">Endereço:</span> ${esc(c.endereco)}</div><div><span class="k">Telefone:</span> ${esc(c.telefone)}</div><div><span class="k">Local:</span> ${esc(c.local)}</div><div><span class="k">CNPJ:</span> ${esc(c.cnpj)}</div>`;
}
$("#w-modelo").onchange = e => { const t = TEXTOS_PRONTOS.find(x => x.id === e.target.value); if (e.target.value === "livre") $("#w-desc").value = ""; else if (t) $("#w-desc").value = t.texto; };

function setStep(n) {
  step = Math.max(1, Math.min(7, n));
  $("#steps").innerHTML = NAMES.map((_, i) => `<div class="${i + 1 < step ? "done" : i + 1 === step ? "cur" : ""}"></div>`).join("");
  $("#step-name").textContent = NAMES[step - 1]; $("#step-count").textContent = `Etapa ${step} de 7`;
  $$(".wstep").forEach(p => p.hidden = +p.dataset.step !== step);
  $("#btn-prev").style.visibility = step === 1 ? "hidden" : "visible";
  $("#btn-next").textContent = step === 7 ? "Gerar prévia →" : "Continuar →"; window.scrollTo({ top: 0 });
}
function coletarPasso() {
  if (step === 1) {
    os.numero = $("#w-num").value.trim(); os.data = $("#w-data").value; os.atendente = $("#w-atendente").value.trim();
    if (!os.numero) return "Informe o número da O.S.";
    if (!os.data) return "Informe a data.";
    const dup = ordens.find(o => o.numero === os.numero && o.id !== modoEdicao);
    if (dup) return `Já existe uma O.S. com o número ${os.numero}. Use outro número ou edite a existente pelo painel.`;
  }
  if (step === 2 && !os.cliente) return "Selecione o equipamento.";
  if (step === 4) { os.descricao = $("#w-desc").value.trim(); if (!os.descricao) return "Preencha a descrição dos serviços."; }
  if (step === 5) {
    if (os.imagens.length < IMG_MIN) return "Adicione pelo menos uma foto de prova.";
    const semDesc = os.imagens.findIndex(i => !i.desc.trim()); if (semDesc >= 0) return `Descreva a imagem ${semDesc + 1}.`;
  }
  if (step === 6) {
    os.etapas = { recebido: $("#d1").value, chegada: $("#d2").value, concluido: $("#d3").value };
    if (!os.etapas.recebido || !os.etapas.chegada || !os.etapas.concluido) return "Preencha as três datas/horas.";
  }
  if (step === 7) {
    os.tecnico = $("#w-tec-nome").value.trim(); os.clienteAssinante = $("#w-cli-ass").value.trim();
    os.assinaturas = { tec: sigs.tec.get(), cli: sigs.cli.get() };
    if (!os.tecnico) return "Informe o nome do técnico.";
  }
  return null;
}
$("#btn-next").onclick = async () => {
  const erro = coletarPasso(); if (erro) return toast(erro, true);
  if (step === 7) {
    if ($("#sig-salvar").checked && os.assinaturas.tec) { perfil = { nome: os.tecnico, assinatura: os.assinaturas.tec }; setDoc(doc(db, "perfil", usuario.uid), perfil).catch(() => { }); }
    renderDoc(); mostrar("preview");
  } else setStep(step + 1);
};
$("#btn-prev").onclick = () => { coletarPasso(); setStep(step - 1); };
$("#btn-cancelar").onclick = async () => { if (await confirmar("Cancelar edição?", "As alterações não gravadas serão perdidas.", "Sair sem gravar", true)) mostrar("painel"); };
$("#btn-editar").onclick = () => { abrirWizard({ ...os, id: modoEdicao }, false); setStep(7); };
$("#btn-voltar-painel").onclick = () => mostrar("painel");

// --------------------------------------------------------------- imagens
function renderImgs() {
  const html = os.imagens.map((im, i) => `<div class="img-slot ${im.orient === "paisagem" ? "pais" : ""}"><span class="ord">${i + 1}</span><button type="button" class="rm" data-rm="${i}" title="Remover">×</button><img src="${im.data}" alt=""><input value="${esc(im.desc)}" placeholder="Descrição da imagem ${i + 1}" data-desc="${i}"></div>`).join("");
  const n = os.imagens.length, pode = n < IMG_MAX;
  $("#imgs").innerHTML = html;
  $("#img-tools").innerHTML = pode ? `<div class="img-tools-title">${n ? "Adicionar nova foto" : "Adicionar a primeira foto"}</div>
    <label class="btn primary">📷 Tirar foto<input type="file" accept="image/*" capture="environment" data-add hidden></label>
    <label class="btn">🖼 Escolher da galeria<input type="file" accept="image/*" multiple data-add hidden></label>` : `<div class="img-tools-title">Limite de ${IMG_MAX} fotos atingido.</div>`;
  $("#img-count").textContent = n ? `${n} de ${IMG_MAX} fotos. Descreva cada uma e toque em “Continuar” quando terminar.` : `Nenhuma foto ainda (mínimo ${IMG_MIN}, máximo ${IMG_MAX}).`;
  $$("[data-desc]").forEach(inp => inp.oninput = () => os.imagens[+inp.dataset.desc].desc = inp.value);
  $$("[data-rm]").forEach(b => b.onclick = () => { os.imagens.splice(+b.dataset.rm, 1); renderImgs(); });
  $$("[data-add]").forEach(f => f.onchange = async () => {
    loading(true, "Processando foto…");
    for (const file of [...f.files].slice(0, IMG_MAX - os.imagens.length)) {
      try { os.imagens.push({ ordem: os.imagens.length, desc: "", ...(await redimensionar(file)) }); } catch (e) { toast("Não foi possível ler " + file.name, true); }
    }
    loading(false); renderImgs();
    const last = $$("[data-desc]").pop(); if (last) { last.scrollIntoView({ block: "center" }); last.focus(); }
  });
}
// Ajusta a foto: retrato vira 360x504, paisagem vira 504x360 (mesmo tamanho, só girado),
// mantendo a proporção com fundo branco, e gera JPEG leve. Respeita a orientação EXIF do celular.
function redimensionar(file) {
  return new Promise(async (res, rej) => {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { bmp = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = URL.createObjectURL(file); }); }
    try {
      const paisagem = bmp.width > bmp.height, W = paisagem ? IMG_H : IMG_W, H = paisagem ? IMG_W : IMG_H;
      const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      const s = Math.min(W / bmp.width, H / bmp.height), w = bmp.width * s, h = bmp.height * s;
      x.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
      res({ data: c.toDataURL("image/jpeg", 0.82), orient: paisagem ? "paisagem" : "retrato" });
    } catch (e) { rej(e); }
  });
}

// --------------------------------------------------------------- assinaturas
function criarSig(box) {
  const c = $("canvas", box), ctx = c.getContext("2d"), pad = $(".sig-pad", box), drop = $(".drop", box), prev = $(".sig-preview", box);
  let on = false, upload = "";
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#14213d";
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener("pointerdown", e => { on = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); pad.classList.add("has-ink"); e.preventDefault(); });
  c.addEventListener("pointermove", e => { if (!on) return; const [x, y] = pos(e); ctx.lineWidth = e.pointerType === "pen" ? 2 + e.pressure * 3 : 3.2; ctx.lineTo(x, y); ctx.stroke(); });
  const up = () => on = false; c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
  $$("[data-mode]", box).forEach(b => b.onclick = () => { $$("[data-mode]", box).forEach(x => x.classList.toggle("sel", x === b)); pad.hidden = b.dataset.mode !== "draw"; drop.hidden = b.dataset.mode !== "upload"; prev.hidden = b.dataset.mode !== "upload" || !upload; });
  $("input[type=file]", box).onchange = async e => { const f = e.target.files[0]; if (!f) return; upload = await limparFundo(f); prev.hidden = false; $("img", prev).src = upload; };
  $("[data-clear]", box).onclick = () => { ctx.clearRect(0, 0, c.width, c.height); pad.classList.remove("has-ink"); upload = ""; prev.hidden = true; };
  return {
    get() { if (!drop.hidden) return upload; return pad.classList.contains("has-ink") ? c.toDataURL("image/png") : ""; },
    set(data) { ctx.clearRect(0, 0, c.width, c.height); pad.classList.remove("has-ink"); upload = ""; prev.hidden = true;
      if (!data) return; const img = new Image(); img.onload = () => { const s = Math.min(c.width / img.width, c.height / img.height); const w = img.width * s, h = img.height * s; ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h); pad.classList.add("has-ink"); }; img.src = data; }
  };
}
// Remove fundo branco de uma foto de assinatura e devolve PNG transparente
function limparFundo(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const W = 900, s = Math.min(1, W / img.width), c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const lum = (p[i] + p[i + 1] + p[i + 2]) / 3; if (lum > 185) p[i + 3] = 0; else { p[i] = 20; p[i + 1] = 33; p[i + 2] = 61; p[i + 3] = Math.min(255, (185 - lum) * 3); } }
      x.putImageData(d, 0, 0); URL.revokeObjectURL(url); res(c.toDataURL("image/png"));
    };
    img.src = url;
  });
}
const sigs = { tec: criarSig($('.sig-box[data-who=tec]')), cli: criarSig($('.sig-box[data-who=cli]')) };

// --------------------------------------------------------------- documento (prévia e PDF)
function renderDoc() {
  const c = os.cliente || {};
  const figs = os.imagens.map((im, i) => `<figure class="${im.orient === "paisagem" ? "pais" : ""}"><figcaption>Descrição da Imagem ${i + 1}: ${esc(im.desc)}</figcaption><img src="${im.data}" alt=""></figure>`).join("");
  $("#doc").innerHTML = `
    <div class="doc-head"><img src="logo-invotec.svg" alt="Invotec"><div>CNPJ: ${esc(EMPRESA.cnpj)} &nbsp;&nbsp; Contato: ${esc(EMPRESA.contato)}<br>Endereço: ${esc(EMPRESA.endereco)}</div></div>
    <div class="band">ORDEM DE SERVIÇO QUALLYX Nº ${esc(os.numero)}</div>
    <div class="band sub">DADOS DO CLIENTE</div>
    <div class="kv"><b>Cliente:</b><span>${esc(c.nome)}</span><b>CNPJ:</b><span>${esc(c.cnpj)}</span>
      <b>Endereço:</b><span class="wide">${esc(c.endereco)}</span>
      <b>Telefone:</b><span>${esc(c.telefone)}</span><b>Data:</b><span>${fmtData(os.data)}</span>
      <b>Local:</b><span>${esc(c.local)}</span><b>Atendente:</b><span>${esc(os.atendente)}</span></div>
    <div class="band sub">DETALHES DO EQUIPAMENTO E SERVIÇO</div>
    <div class="kv"><b>Equipamento:</b><span class="wide">${esc(os.equipamento)}</span><b>Serviço:</b><span class="wide">${esc(os.tipo)}</span></div>
    <div class="band sub">DESCRIÇÃO DOS SERVIÇOS REALIZADOS</div>
    <div class="desc">${esc(os.descricao)}</div>
    <div class="band sub" style="margin-top:8px">IMAGENS PROVAS</div>
    <div class="proof">${figs}</div>
    <div class="band sub">ETAPAS DO REPARO</div>
    <div class="etapas"><b>Chamado recebido:</b> ${fmtDataHora(os.etapas.recebido)}<br><b>Chegada no cliente:</b> ${fmtDataHora(os.etapas.chegada)}<br><b>Chamado concluído:</b> ${fmtDataHora(os.etapas.concluido)}</div>
    <div class="sigs">
      <div>${os.assinaturas.tec ? `<img class="sig-img" src="${os.assinaturas.tec}" alt="">` : '<div class="sig-empty"></div>'}<div class="ln">Técnico: ${esc(os.tecnico)}<br>Data: ${fmtData(os.data)}</div></div>
      <div>${os.assinaturas.cli ? `<img class="sig-img" src="${os.assinaturas.cli}" alt="">` : '<div class="sig-empty"></div>'}<div class="ln">Cliente: ${esc(os.clienteAssinante)}<br>Data: ${fmtData(os.data)}</div></div>
    </div>`;
  $("#pv-title").textContent = "Prévia · O.S. Nº " + os.numero;
}
async function gravar() {
  loading(true, "Gravando na nuvem…");
  try {
    const id = "os-" + os.numero.replace(/[^\w-]/g, "_");
    const dados = { numero: os.numero, numeroOrd: parseInt(os.numero, 10) || 0, data: os.data, atendente: os.atendente, equipamento: os.equipamento, cliente: os.cliente, tipo: os.tipo,
      descricao: os.descricao, etapas: os.etapas, tecnico: os.tecnico, clienteAssinante: os.clienteAssinante, assinaturas: os.assinaturas, qtdImagens: os.imagens.length,
      uid: usuario.uid, atualizadoEm: serverTimestamp() };
    if (!modoEdicao || modoEdicao !== id) dados.criadoEm = serverTimestamp();
    // apaga imagens antigas (e o doc antigo, se o número mudou)
    if (modoEdicao) { const old = await getDocs(collection(db, "ordens", modoEdicao, "imagens")); const b = writeBatch(db); old.docs.forEach(x => b.delete(x.ref)); if (modoEdicao !== id) b.delete(doc(db, "ordens", modoEdicao)); await b.commit(); }
    await setDoc(doc(db, "ordens", id), dados, { merge: true });
    const batch = writeBatch(db);
    os.imagens.forEach((im, i) => batch.set(doc(db, "ordens", id, "imagens", "img-" + pad(i + 1)), { ordem: i, desc: im.desc, data: im.data, orient: im.orient || "retrato" }));
    await batch.commit();
    modoEdicao = id; toast("O.S. " + os.numero + " gravada.");
    await carregarPainel(); return true;
  } catch (err) { toast("Erro ao gravar: " + err.message, true); console.error(err); return false; }
  finally { loading(false); }
}
async function baixarPDF() {
  if (typeof html2pdf !== "function") { // biblioteca não carregou: usa a impressão do navegador
    toast("Use “Salvar como PDF” na janela de impressão."); window.print(); return;
  }
  loading(true, "Gerando PDF…");
  try {
    const el = $("#doc"); el.classList.add("exportando");
    await html2pdf().set({
      margin: [10, 10, 12, 10], filename: `OS-${os.numero}-Invotec.pdf`, image: { type: "jpeg", quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["figure", ".kv", ".etapas", ".sigs", ".band"] }
    }).from(el).save();
    el.classList.remove("exportando");
  } catch (err) { toast("Erro ao gerar PDF: " + err.message, true); console.error(err); }
  finally { loading(false); }
}
$("#btn-salvar").onclick = async () => { if (await gravar()) mostrar("painel"); };

// --------------------------------------------------------------- importar / exportar (JSON)
// Formato: { ordens: [ { numero, data, atendente, equipamento, cliente{...}, tipo, descricao, etapas{...}, tecnico, clienteAssinante, assinaturas{tec,cli}, imagens:[{ordem,desc,data,orient}] } ] }
async function importarOS(json, { sobrescrever = false } = {}) {
  const lista = Array.isArray(json) ? json : (json.ordens || []);
  if (!lista.length) throw new Error("Arquivo sem O.S.");
  let novas = 0, puladas = 0;
  for (const o of lista) {
    const numero = String(o.numero || "").trim(); if (!numero) { puladas++; continue; }
    const id = "os-" + numero.replace(/[^\w-]/g, "_");
    loading(true, `Importando O.S. ${numero}…`);
    if (!sobrescrever && (await getDoc(doc(db, "ordens", id))).exists()) { puladas++; continue; }
    const imgs = o.imagens || [];
    const dados = { numero, numeroOrd: parseInt(numero, 10) || 0, data: o.data || "", atendente: o.atendente || EMPRESA.atendentePadrao, equipamento: o.equipamento || "", cliente: o.cliente || null,
      tipo: o.tipo || "", descricao: o.descricao || "", etapas: o.etapas || { recebido: "", chegada: "", concluido: "" }, tecnico: o.tecnico || EMPRESA.tecnicoPadrao,
      clienteAssinante: o.clienteAssinante || "", assinaturas: o.assinaturas || { tec: "", cli: "" }, qtdImagens: imgs.length, uid: usuario.uid, importadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), criadoEm: serverTimestamp() };
    const batch = writeBatch(db);
    batch.set(doc(db, "ordens", id), dados);
    imgs.forEach((im, i) => batch.set(doc(db, "ordens", id, "imagens", "img-" + pad(i + 1)), { ordem: i, desc: im.desc || "", data: im.data, orient: im.orient || "retrato" }));
    await batch.commit(); novas++;
  }
  loading(false);
  return { novas, puladas };
}
window.importarOS = importarOS; // uso avançado pelo console
$("#imp-file").onchange = async e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = "";
  try {
    const json = JSON.parse(await f.text());
    const n = (Array.isArray(json) ? json : json.ordens || []).length;
    if (!(await confirmar("Importar " + n + " O.S.?", "O.S. com número já existente serão puladas. As demais entram no histórico com suas fotos."))) return;
    const r = await importarOS(json);
    toast(`Importação concluída: ${r.novas} gravadas, ${r.puladas} puladas.`); await carregarPainel();
  } catch (err) { loading(false); toast("Falha na importação: " + err.message, true); console.error(err); }
};
$("#btn-exportar").onclick = async () => {
  loading(true, "Montando backup…");
  try {
    const todas = [];
    for (const o of ordens) { const c = await carregarCompleta(o.id); loading(true, "Montando backup… " + o.numero); if (c) { const { id, uid, criadoEm, atualizadoEm, importadoEm, qtdImagens, ...resto } = c; todas.push(resto); } }
    const blob = new Blob([JSON.stringify({ versao: 1, exportadoEm: new Date().toISOString(), ordens: todas })], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `backup-os-invotec-${hojeISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`Backup com ${todas.length} O.S. gerado.`);
  } catch (err) { toast("Erro no backup: " + err.message, true); }
  finally { loading(false); }
};
$("#btn-salvar-pdf").onclick = async () => { if (await gravar()) await baixarPDF(); };
