
// ===== GoatCounter (Dashboard) =====
let gcChartInstance = null;

function gcPrettyName(kind, item) {
  // Normalize empty/unknown fields to PT-BR labels
  if (!item) return "";
  if (kind === "toprefs") {
    const n = (item.name || item.id || "").trim();
    return n ? n : "(desconhecido)";
  }
  if (kind === "locations") {
    const n = (item.name || item.id || "").trim();
    if (n === "Brazil") return "Brasil";
    return n || "(desconhecido)";
  }
  if (kind === "sizes") {
    const id = (item.id || "").toLowerCase();
    const map = {
      "phone": "Celulares",
      "tablet": "Tablets",
      "desktop": "Computadores",
      "desktophd": "Monitores HD+",
      "unknown": "Desconhecido"
    };
    return map[id] || (item.name || item.id || "(desconhecido)");
  }
  const n = (item.name || item.id || item.path || "").toString().trim();
  return n || "(desconhecido)";
}

function gcFormatList(containerId, items, nameKey = "name", countKey = "count", kind = "") {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<div class="gc-row"><span class="k">Sem dados</span><span class="v">—</span></div>';
    return;
  }
  el.innerHTML = items.map(i => {
    const name = gcPrettyName(kind, i);
    const count = (i[countKey] ?? i.count ?? 0);
    return `<div class="gc-row"><span class="k" title="${name.replace(/"/g, '&quot;')}">${name}</span><span class="v">${count}</span></div>`;
  }).join("");
}

function gcSetStat(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = (val === undefined || val === null) ? "—" : String(val);
}

function gcRenderChart(payload, mode = "daily") {
  const canvas = document.getElementById("gcChartCanvas");
  if (!canvas || !window.Chart) return;

  // Payloads we use:
  // - daily: data.dailyChart (GoatCounter /stats/hits?daily=1) => array with [0].stats[{day,daily}]
  // - hourly: data.todayHourly / data.yestHourly => [0].stats[{day,hourly:[24]}]
  const list = payload?.hits || payload;
  const item = Array.isArray(list) ? list[0] : null;
  const stats = item?.stats || [];

  let labels = [];
  let values = [];
  let label = "Visitas";

  if (mode === "hourly") {
    const h = stats[0]?.hourly || new Array(24).fill(0);
    labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0") + "h");
    values = h.map(v => (typeof v === "number" ? v : 0));
    label = "Visitas (hora)";
  } else {
    labels = stats.map(s => s.day);
    values = stats.map(s => (typeof s.daily === "number" ? s.daily : 0));
    label = "Visitas (dia)";
  }

  if (gcChartInstance) gcChartInstance.destroy();

  gcChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        tension: 0.35,
        fill: false,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        x: { ticks: { maxTicksLimit: mode === "hourly" ? 6 : 6 } },
        y: { beginAtZero: true }
      }
    }
  });
}

let gcLoading = false;

async function loadGoatcounterPanel(rangeDays = 7, view = "range") {
  if (gcLoading) return; gcLoading = true;
  try {
    const res = await fetch(`/api/goatcounter?range=${rangeDays}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Falha ao carregar métricas");

    const totals = data.totals || {};
    // GoatCounter /stats/total returns totals + stats by day; derive today/yesterday if fields don't exist.
    let totalAll = (typeof totals.total === "number") ? totals.total : null;
    const stats = Array.isArray(totals.stats) ? totals.stats : [];
    const todayKey = data.today;
    const yKey = data.yesterday;

    const todayObj = stats.find(x => x.day === todayKey);
    const yObj = stats.find(x => x.day === yKey);

    const todayCount = (typeof totals.today === "number") ? totals.today : (todayObj ? (todayObj.daily || 0) : "—");
    const yCount = (typeof totals.yesterday === "number") ? totals.yesterday : (yObj ? (yObj.daily || 0) : "—");

    gcSetStat("gcVisitsToday", todayCount ?? "—");
    gcSetStat("gcVisitsYesterday", yCount ?? "—");
    gcSetStat("gcVisitsTotal", (totalAll ?? "—"));

        // Lists
    const pagesArr = data.pages?.hits || data.pages?.stats || data.pages || [];
    (function renderPages(){
    const el = document.getElementById("gcPagesList");
    if (!el) return;
    if (!pagesArr || !pagesArr.length) {
      el.innerHTML = '<div class="gc-row"><span class="k">Sem dados</span><span class="v">—</span></div>';
      return;
    }
    el.innerHTML = pagesArr.map(p => {
      const path = (p.path || p.id || "(desconhecido)").toString();
      const title = (p.title || "").toString();
      const count = (p.count ?? 0);
      const safeTitle = title.replace(/"/g,'&quot;');
      return `<div class="gc-row gc-row-pages">
        <div class="k">
          <div class="gc-page-path" title="${path.replace(/"/g,'&quot;')}">${path}</div>
          ${title ? `<div class="gc-page-title" title="${safeTitle}">${title}</div>` : ``}
        </div>
        <span class="v">${count}</span>
      </div>`;
    }).join("");
  })();

    gcFormatList("gcRefsList", data.toprefs?.stats || data.toprefs || [], "name", "count", "toprefs");
    gcFormatList("gcBrowsersList", data.browsers?.stats || data.browsers || [], "name", "count", "browsers");
    gcFormatList("gcSystemsList", data.systems?.stats || data.systems || [], "name", "count", "systems");
    gcFormatList("gcLocationsList", data.locations?.stats || data.locations || [], "name", "count", "locations");
    gcFormatList("gcSizesList", data.sizes?.stats || data.sizes || [], "name", "count", "sizes");

    // Chart modes
    if (view === "today") {
      gcRenderChart(data.todayHourly, "hourly");
    } else if (view === "yesterday") {
      gcRenderChart(data.yestHourly, "hourly");
    } else {
      gcRenderChart(data.dailyChart, "daily");
    }

  } catch (e) {
    console.warn("GoatCounter panel error:", e);
    gcSetStat("gcVisitsToday", "—");
    gcSetStat("gcVisitsYesterday", "—");
    gcSetStat("gcVisitsTotal", "—");
  } finally {
    gcLoading = false;
  }
}

function initGoatcounterUI() {
  const rangeBtns = document.querySelectorAll(".gc-range-btn");
  const viewBtns = document.querySelectorAll(".gc-view-btn");

  let currentRange = 7;
  let currentView = "range";

  function setActive(btns, activeBtn) {
    btns.forEach(x => x.classList.remove("is-active"));
    if (activeBtn) activeBtn.classList.add("is-active");
  }

  rangeBtns.forEach(b => {
    b.addEventListener("click", () => {
      currentRange = parseInt(b.getAttribute("data-gc-range") || "7", 10);
      currentView = "range";
      setActive(rangeBtns, b);
      setActive(viewBtns, null);
      loadGoatcounterPanel(currentRange, currentView);
    });
  });

  viewBtns.forEach(b => {
    b.addEventListener("click", () => {
      const v = (b.getAttribute("data-gc-view") || "today").toLowerCase();
      currentView = v;
      setActive(viewBtns, b);
      // keep range selected but not active state
      rangeBtns.forEach(x => x.classList.remove("is-active"));
      loadGoatcounterPanel(currentRange, currentView);
    });
  });

  // initial
  loadGoatcounterPanel(currentRange, currentView);
}


// Firebase imports e configuração
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  updateDoc, 
  setDoc,
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAaziMYrOPaI4D-vr1qGDFbGGV9ToVcwQ4",
  authDomain: "ottakubrasil-cb8c1.firebaseapp.com",
  projectId: "ottakubrasil-cb8c1",
  storageBucket: "ottakubrasil-cb8c1.firebasestorage.app",
  messagingSenderId: "117674731024",
  appId: "1:117674731024:web:4b74600ab12a6ebfe70c95",
  measurementId: "G-EQZP2C8DSC"
};

// Inicializar Firebase e Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Inicializar Firebase Auth
const auth = getAuth(app);

// Referências às coleções
const NEWS_COLLECTION = "newsCards";
const PARTNERS_COLLECTION = "partners";
const GAMING_COLLECTION = "gamingCards";
const QUIZ_COLLECTION = "quizWinners";
const SETTINGS_COLLECTION = "siteSettings";
const GENERAL_WINNERS_COLLECTION = "generalWinners";

// ===== LOGIN FLOW =====
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const loggedUser = document.getElementById("loggedUser");
const btnLogout = document.getElementById("btnLogout");

function showLogin() {
  if (loginScreen) loginScreen.style.display = "flex";
  if (appShell) appShell.style.display = "none";
  if (loginError) loginError.textContent = "";
  if (loginBtn) loginBtn.disabled = false;
}

function showApp(user) {
  if (loginScreen) loginScreen.style.display = "none";
  if (appShell) appShell.style.display = "flex";
  if (loggedUser && user) {
    loggedUser.textContent = user.email || "Admin";
  }
}

async function doLogin(email, password) {
  // Persistência local para não pedir login toda hora
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

function normalizeUserToEmail(value) {
  const v = (value || "").trim();
  // Recomendo usar EMAIL do Firebase Auth aqui.
  // Se quiser manter "usuário" sem @, você teria que mapear para um email real.
  return v;
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loginError) loginError.textContent = "";

    const userRaw = loginUser ? loginUser.value : "";
    const password = loginPass ? loginPass.value : "";
    const email = normalizeUserToEmail(userRaw);

    if (!email || !password) {
      if (loginError) loginError.textContent = "Preencha usuário e senha.";
      return;
    }

    // Se não parecer email, dá um aviso claro
    if (!email.includes("@")) {
      if (loginError) loginError.textContent = "Use o e-mail cadastrado no Firebase Auth como usuário.";
      return;
    }

    try {
      if (loginBtn) loginBtn.disabled = true;
      await doLogin(email, password);
      // onAuthStateChanged cuidará de abrir o painel
    } catch (err) {
      console.error(err);
      const code = err?.code || "";
      let msg = "Usuário ou senha incorretos.";
      if (code.includes("auth/too-many-requests")) msg = "Muitas tentativas. Tente novamente em alguns minutos.";
      if (code.includes("auth/network-request-failed")) msg = "Falha de rede. Verifique sua conexão.";
      if (code.includes("auth/user-not-found")) msg = "Usuário não encontrado.";
      if (code.includes("auth/wrong-password")) msg = "Senha incorreta.";
      if (loginError) loginError.textContent = msg;
      if (loginBtn) loginBtn.disabled = false;
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showLogin();
    } catch (e) {
      console.error(e);
    }
  });
}


// Evita rodar initDashboard antes do usuário estar autenticado (isso gerava toast de erro no reload)
let __dashboardStarted = false;
async function startDashboardIfNeeded() {
  if (__dashboardStarted) return;
  if (!auth.currentUser) return;
  __dashboardStarted = true;
  try {
    await initDashboard();
  } catch (e) {
    console.error(e);
    showToast('error', 'Erro de conexão', 'Não foi possível conectar ao Firebase.');
  }
}

// Estado de autenticação
onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
    startDashboardIfNeeded();
  } else {
    __dashboardStarted = false;
    showLogin();
  }
});
// ===== DOM HELPERS =====
// Proxy que resolve automaticamente os IDs do DOM quando acessados.
// Ex: els.btnNovaNoticia -> document.getElementById('btnNovaNoticia')
// Isso evita manter uma lista gigante e previne ReferenceError.
const els = new Proxy({}, {
  get: (_target, prop) => {
    if (typeof prop !== 'string') return undefined;
    return document.getElementById(prop);
  }
});

// ===== LOGIN REMOVIDO (MODO PREVIEW) =====
let currentUser = { username: "admin", name: "Administrador" };

function showDashboard() {
  if (els.loginScreen) els.loginScreen.style.display = "none";
  if (els.appShell) els.appShell.style.display = "flex";

  if (els.loggedUser) els.loggedUser.textContent = currentUser.name;
  if (els.userPill) els.userPill.textContent = `Ottaku Brasil • ${currentUser.name}`;
}

function logout() {
  // Em modo preview sem login, logout apenas recarrega
  location.reload();
}


// ===== IMAGEM: Link ou Base64 comprimida (<= 1MB) =====
function base64SizeBytes(dataUrl) {
  if (!dataUrl) return 0;
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // base64 length -> bytes
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

async function compressImageToDataUrl(file, {
  maxBytes = 1024 * 1024,
  maxDim = 1200,
  prefer = "image/webp",
  minQuality = 0.45
} = {}) {
  if (!file) return "";

  // decode
  const bitmap = await createImageBitmap(file);
  let w = bitmap.width;
  let h = bitmap.height;

  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(bitmap, 0, 0, w, h);

  const types = [prefer, "image/jpeg"];
  let type = types.find(t => {
    try { return canvas.toDataURL(t, 0.8).startsWith("data:" + t); } catch { return false; }
  }) || "image/jpeg";

  let quality = 0.86;
  let out = canvas.toDataURL(type, quality);

  // iterative compress: quality then dimensions
  let guard = 0;
  while (base64SizeBytes(out) > maxBytes && guard < 30) {
    guard++;

    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.06);
    } else {
      // reduce dimensions and retry
      w = Math.max(400, Math.round(w * 0.88));
      h = Math.max(400, Math.round(h * 0.88));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
      quality = 0.82;
    }

    out = canvas.toDataURL(type, quality);
  }

  // final check
  if (base64SizeBytes(out) > maxBytes) {
    // last fallback: force jpeg smaller
    type = "image/jpeg";
    quality = 0.6;
    out = canvas.toDataURL(type, quality);
    if (base64SizeBytes(out) > maxBytes) {
      // try even smaller dimensions
      w = Math.max(320, Math.round(w * 0.8));
      h = Math.max(320, Math.round(h * 0.8));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
      out = canvas.toDataURL(type, 0.55);
    }
  }

  if (base64SizeBytes(out) > maxBytes) {
    throw new Error("Não consegui comprimir para 1MB. Tente uma imagem menor.");
  }
  return out;
}

function bindImageMode({
  base64RadioId,
  linkRadioId,
  base64WrapId,
  linkWrapId,
  fileInputId,
  hiddenBase64Id,
  infoId,
  linkInputId
}) {
  const base64Radio = document.getElementById(base64RadioId);
  const linkRadio = document.getElementById(linkRadioId);
  const base64Wrap = document.getElementById(base64WrapId);
  const linkWrap = document.getElementById(linkWrapId);
  const fileInput = document.getElementById(fileInputId);
  const hidden = document.getElementById(hiddenBase64Id);
  const info = document.getElementById(infoId);
  const linkInput = linkInputId ? document.getElementById(linkInputId) : null;

  function apply() {
    const mode = base64Radio?.checked ? "base64" : "link";
    if (base64Wrap) base64Wrap.style.display = (mode === "base64") ? "block" : "none";
    if (linkWrap) linkWrap.style.display = (mode === "link") ? "block" : "none";

    if (linkInput) {
      // required only in link mode
      linkInput.required = (mode === "link");
    }
    return mode;
  }

  base64Radio?.addEventListener("change", apply);
  linkRadio?.addEventListener("change", apply);

  fileInput?.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      if (info) info.textContent = "Comprimindo...";
      const dataUrl = await compressImageToDataUrl(f, { maxBytes: 1024 * 1024 });
      if (hidden) hidden.value = dataUrl;

      const kb = Math.round(base64SizeBytes(dataUrl) / 1024);
      if (info) info.textContent = `OK: ${kb} KB (<= 1MB).`;
    } catch (e) {
      console.error(e);
      if (hidden) hidden.value = "";
      if (info) info.textContent = e?.message || "Erro ao processar imagem.";
      showToast?.('error', 'Imagem', e?.message || 'Erro ao processar imagem.');
    }
  });

  apply();

  return {
    getMode: () => (base64Radio?.checked ? "base64" : "link"),
    setMode: (m) => {
      if (m === "link") { if (linkRadio) linkRadio.checked = true; }
      else { if (base64Radio) base64Radio.checked = true; }
      apply();
    },
    setFromValue: (value) => {
      const v = (value || "").trim();
      const isData = v.startsWith("data:image/");
      if (isData) {
        if (hidden) hidden.value = v;
        if (info) {
          const kb = Math.round(base64SizeBytes(v) / 1024);
          info.textContent = `OK: ${kb} KB (<= 1MB).`;
        }
        if (fileInput) fileInput.value = "";
        if (linkInput) linkInput.value = "";
        if (base64Radio) base64Radio.checked = true;
      } else {
        if (linkInput) linkInput.value = v;
        if (hidden) hidden.value = "";
        if (fileInput) fileInput.value = "";
        if (linkRadio) linkRadio.checked = true;
      }
      apply();
    },
    getFinalValue: () => {
      const mode = base64Radio?.checked ? "base64" : "link";
      if (mode === "base64") return (hidden?.value || "").trim();
      return (linkInput?.value || "").trim();
    }
  };
}

// ===== TOAST SYSTEM =====
function showToast(type, title, message, duration = 5000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="${icon}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Animar entrada
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  }, 10);
  
  // Configurar botão de fechar
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    hideToast(toast);
  });
  
  // Auto remover após duração
  if (duration > 0) {
    setTimeout(() => {
      hideToast(toast);
    }, duration);
  }
  
  return toast;
}

function hideToast(toast) {
  toast.classList.add('hiding');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

// ===== BOOTSTRAP (SEM LOGIN) =====
showDashboard();

// Eventos de logout (se existirem)
if (els.btnLogout) els.btnLogout.addEventListener("click", logout);
if (els.topbarLogout) els.topbarLogout.addEventListener("click", logout);

// ===== DASHBOARD FUNCTIONS =====
// Variáveis globais para armazenar os dados
let newsList = [];
let partnersList = [];
let gamingList = [];
let quizList = [];

// ===== NEWS FUNCTIONS =====
async function loadNews() {
  try {
    const querySnapshot = await getDocs(collection(db, NEWS_COLLECTION));
    newsList = [];
    querySnapshot.forEach((doc) => {
      newsList.push({ id: doc.id, ...doc.data() });
    });
    renderNewsTable();
    updateDashboardStats();
  } catch (error) {
    console.error("Erro ao carregar notícias:", error);
    showToast('error', 'Erro ao carregar', 'Não foi possível carregar as notícias.');
  }
}

async function saveNewsItem(item) {
  try {
    if (item.id) {
      // Atualizar documento existente
      const docRef = doc(db, NEWS_COLLECTION, item.id);
      const { id, createdAt, ...data } = item;
      data.updatedAt = data.updatedAt || Date.now();
      await updateDoc(docRef, data);
    } else {
      // Criar novo documento
      const { id, ...data } = item;
      data.createdAt = data.createdAt || Date.now();
      data.updatedAt = data.updatedAt || Date.now();
      await addDoc(collection(db, NEWS_COLLECTION), data);
    }
    await loadNews();
    return true;
  } catch (error) {
    console.error("Erro ao salvar notícia:", error);
    showToast('error', 'Erro ao salvar', 'Não foi possível salvar a notícia.');
    return false;
  }
}

async function deleteNewsItem(id) {
  try {
    await deleteDoc(doc(db, NEWS_COLLECTION, id));
    await loadNews();
    return true;
  } catch (error) {
    console.error("Erro ao excluir notícia:", error);
    showToast('error', 'Erro ao excluir', 'Não foi possível excluir a notícia.');
    return false;
  }
}

// ===== PARTNERS FUNCTIONS =====
async function loadPartners() {
  try {
    const querySnapshot = await getDocs(collection(db, PARTNERS_COLLECTION));
    partnersList = [];
    querySnapshot.forEach((doc) => {
      partnersList.push({ id: doc.id, ...doc.data() });
    });
    renderPartnersTable();
    updateDashboardStats();
  } catch (error) {
    console.error("Erro ao carregar parceiros:", error);
    showToast('error', 'Erro ao carregar', 'Não foi possível carregar os parceiros.');
  }
}

async function savePartnerItem(item) {
  try {
    if (item.id) {
      // Atualizar documento existente
      const docRef = doc(db, PARTNERS_COLLECTION, item.id);
      const { id, createdAt, ...data } = item;
      data.updatedAt = data.updatedAt || Date.now();
      await updateDoc(docRef, data);
    } else {
      // Criar novo documento
      const { id, ...data } = item;
      data.createdAt = data.createdAt || Date.now();
      data.updatedAt = data.updatedAt || Date.now();
      await addDoc(collection(db, PARTNERS_COLLECTION), data);
    }
    await loadPartners();
    return true;
  } catch (error) {
    console.error("Erro ao salvar parceiro:", error);
    showToast('error', 'Erro ao salvar', 'Não foi possível salvar o parceiro.');
    return false;
  }
}

async function deletePartnerItem(id) {
  try {
    await deleteDoc(doc(db, PARTNERS_COLLECTION, id));
    await loadPartners();
    return true;
  } catch (error) {
    console.error("Erro ao excluir parceiro:", error);
    showToast('error', 'Erro ao excluir', 'Não foi possível excluir o parceiro.');
    return false;
  }
}

// ===== GAMING FUNCTIONS =====
async function loadGaming() {
  try {
    const querySnapshot = await getDocs(collection(db, GAMING_COLLECTION));
    gamingList = [];
    querySnapshot.forEach((doc) => {
      gamingList.push({ id: doc.id, ...doc.data() });
    });
    renderGamingTable();
    updateDashboardStats();
  } catch (error) {
    console.error("Erro ao carregar gaming:", error);
    showToast('error', 'Erro ao carregar', 'Não foi possível carregar os cards gaming.');
  }
}

async function saveGamingItem(item) {
  try {
    if (item.id) {
      // Atualizar documento existente
      const docRef = doc(db, GAMING_COLLECTION, item.id);
      const { id, createdAt, ...data } = item;
      data.updatedAt = data.updatedAt || Date.now();
      await updateDoc(docRef, data);
    } else {
      // Criar novo documento
      const { id, ...data } = item;
      data.createdAt = data.createdAt || Date.now();
      data.updatedAt = data.updatedAt || Date.now();
      await addDoc(collection(db, GAMING_COLLECTION), data);
    }
    await loadGaming();
    return true;
  } catch (error) {
    console.error("Erro ao salvar gaming:", error);
    showToast('error', 'Erro ao salvar', 'Não foi possível salvar o card gaming.');
    return false;
  }
}

async function deleteGamingItem(id) {
  try {
    await deleteDoc(doc(db, GAMING_COLLECTION, id));
    await loadGaming();
    return true;
  } catch (error) {
    console.error("Erro ao excluir gaming:", error);
    showToast('error', 'Erro ao excluir', 'Não foi possível excluir o card gaming.');
    return false;
  }
}

// ===== QUIZ FUNCTIONS =====
async function loadQuiz() {
  try {
    const querySnapshot = await getDocs(collection(db, QUIZ_COLLECTION));
    quizList = [];
    querySnapshot.forEach((doc) => {
      quizList.push({ id: doc.id, ...doc.data() });
    });
    renderQuizTable();
    updateQuizPreview();
    updateDashboardStats();
  } catch (error) {
    console.error("Erro ao carregar quiz:", error);
    showToast('error', 'Erro ao carregar', 'Não foi possível carregar os ganhadores.');
  }
}


// ===== CONFIGURAÇÕES (LINKS, LIVEPIX E GANHADORES GERAIS) =====

async function loadSiteLinks() {
  const ref = doc(db, SETTINGS_COLLECTION, "links");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    els.setInstagramUrl.value = data.instagramUrl || "";
    els.setWhatsappChannelUrl.value = data.whatsappChannelUrl || "";
    els.setWhatsappGroupUrl.value = data.whatsappGroupUrl || "";
    els.setInstagramHandle.value = data.instagramHandle || "";
  } else {
    // defaults (opcional)
    els.setInstagramUrl.value = "https://instagram.com/ottakubrasil";
  }
}

async function saveSiteLinks() {
  try {
    const payload = {
      instagramUrl: (els.setInstagramUrl.value || "").trim(),
      whatsappChannelUrl: (els.setWhatsappChannelUrl.value || "").trim(),
      whatsappGroupUrl: (els.setWhatsappGroupUrl.value || "").trim(),
      instagramHandle: (els.setInstagramHandle.value || "").trim(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, SETTINGS_COLLECTION, "links"), payload, { merge: true });
    showToast('success', 'Links gerais salvos!');
    updateDashboardStats();
  } catch (e) {
    console.error(e);
    showToast('error', 'Erro ao salvar links gerais');
  }
}

async function loadLivepix() {
  const ref = doc(db, SETTINGS_COLLECTION, "livepix");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    els.setLivepixDonateUrl.value = data.donateUrl || "";
    els.setLivepixRankEmbedUrl.value = data.rankEmbedUrl || "";
  }
}

async function saveLivepix() {
  try {
    const payload = {
      donateUrl: (els.setLivepixDonateUrl.value || "").trim(),
      rankEmbedUrl: (els.setLivepixRankEmbedUrl.value || "").trim(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, SETTINGS_COLLECTION, "livepix"), payload, { merge: true });
    showToast('success', 'Livepix salvo!');
  } catch (e) {
    console.error(e);
    showToast('error', 'Erro ao salvar Livepix');
  }
}

function gwCategoryLabel(cat){
  const map = { quiz: "Quiz", gaming: "Gaming", instagram: "Instagram" };
  return map[cat] || cat;
}

function gwIconClass(cat){
  const c = (cat||"").toLowerCase();
  if (c === 'instagram') return 'fab fa-instagram';
  // Quiz e Gaming: gamepad (igual ao site)
  return 'fas fa-gamepad';
}

async function loadGeneralWinners() {
  try {
    const querySnapshot = await getDocs(collection(db, GENERAL_WINNERS_COLLECTION));
    const list = [];
    querySnapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));

    // ordenar: categoria, depois mais recente
    list.sort((a, b) => {
      const ca = (a.category || "").toLowerCase();
      const cb = (b.category || "").toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      const ta = a.updatedAt ? (typeof a.updatedAt === "number" ? a.updatedAt : Date.parse(a.updatedAt)) : 0;
      const tb = b.updatedAt ? (typeof b.updatedAt === "number" ? b.updatedAt : Date.parse(b.updatedAt)) : 0;
      return tb - ta;
    });

    renderGeneralWinners(list);
  } catch (e) {
    console.error(e);
    showToast('error', 'Erro ao carregar ganhadores gerais');
  }
}

function renderGeneralWinners(list) {
  if (!els.generalWinnersList) return;

  if (!list.length) {
    els.generalWinnersList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-trophy"></i>
        <h3>Nenhum ganhador salvo</h3>
        <p>Você pode salvar quantos ganhadores quiser por categoria.</p>
      </div>`;
    return;
  }

  els.generalWinnersList.innerHTML = list.map(item => {
    const cat = item.category || "quiz";
    const title = gwCategoryLabel(cat);
    const icon = gwIconClass(cat);

    const photo = (item.imageUrl || "").trim();
    const hasPhoto = !!photo;

    const handle = (item.instagramHandle || item.handle || "").trim();
    const handleHtml = handle ? `<div class="mini">@${handle.replace(/^@/, "")}</div>` : "";

    const prize = (item.prize || "").trim();
    const prizeHtml = prize ? `<div class="mini">${prize}</div>` : "";

    const dateLabel = (item.dateLabel || item.date || "").trim();
    const dateHtml = dateLabel ? `<div class="mini">${dateLabel}</div>` : "";

    const name = (item.name || "").trim() || "(Sem nome)";

    return `
      <div class="card general-winner-card">
        <div class="card-top">
          <div class="badge-pill" style="border-color:#f59e0b;background:rgba(245,158,11,.12);">
            <i class="${icon}"></i> ${title}
          </div>

          <div class="card-actions">
            <button class="btn btn-ghost" data-edit-gw="${item.id}" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn btn-ghost" data-del-gw="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
          </div>
        </div>

        <div class="winner-row">
          <div class="winner-avatar" style="${hasPhoto ? `background-image:url('${photo.replace(/'/g, "\\'")}')` : ""}"></div>
          <div class="winner-meta">
            <div class="winner-name">${name}</div>
            ${handleHtml}
            ${prizeHtml}
            ${dateHtml}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // bind edit
  els.generalWinnersList.querySelectorAll('[data-edit-gw]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit-gw');
      if (!id) return;
      await loadGeneralWinnerIntoFormById(id);
      els.gwName?.focus();
    });
  });

  // bind delete
  els.generalWinnersList.querySelectorAll('[data-del-gw]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-gw');
      if (!id) return;
      const ok = confirm("Excluir este ganhador geral? Essa ação não pode ser desfeita.");
      if (!ok) return;
      try {
        await deleteDoc(doc(db, GENERAL_WINNERS_COLLECTION, id));
        showToast('success', 'Excluído', 'Ganhador geral removido.');
        await loadGeneralWinners();
      } catch (e) {
        console.error(e);
        showToast('error', 'Erro', 'Não foi possível excluir.');
      }
    });
  });
}

async function loadGeneralWinnerIntoFormById(id) {
  try {
    const ref = doc(db, GENERAL_WINNERS_COLLECTION, id);
    const snap = await getDoc(ref);

    // reset base
    els.gwId.value = id;
    if (!snap.exists()) return;

    const d = snap.data() || {};
    els.gwCategory.value = d.category || "quiz";
    els.gwName.value = d.name || "";
    els.gwHandle.value = d.instagramHandle || d.handle || "";
    els.gwPrize.value = d.prize || "";
    els.gwDate.value = d.dateLabel || d.date || "";

    // foto (link ou base64)
    if (window.__gwPhoto) window.__gwPhoto.setFromValue(d.imageUrl || "");
    else els.gwImageUrl.value = d.imageUrl || "";

    els.gwProfileUrl.value = d.profileUrl || "";
  } catch (e) {
    console.error(e);
  }
}

function clearGeneralWinnerForm() {
  if (els.gwId) els.gwId.value = "";
  if (els.gwCategory) els.gwCategory.value = "quiz";
  if (els.gwName) els.gwName.value = "";
  if (els.gwHandle) els.gwHandle.value = "";
  if (els.gwPrize) els.gwPrize.value = "";
  if (els.gwDate) els.gwDate.value = "";
  if (window.__gwPhoto) window.__gwPhoto.setFromValue("");
  else if (els.gwImageUrl) els.gwImageUrl.value = "";
  if (els.gwProfileUrl) els.gwProfileUrl.value = "";
}

async function saveGeneralWinner() {
  try {
    const id = (els.gwId?.value || "").trim();
    const category = (els.gwCategory.value || "").trim() || "quiz";

    const payload = {
      category,
      name: (els.gwName.value || "").trim(),
      instagramHandle: (els.gwHandle.value || "").trim(),
      prize: (els.gwPrize.value || "").trim(),
      dateLabel: (els.gwDate.value || "").trim(),
      imageUrl: (window.__gwPhoto ? window.__gwPhoto.getFinalValue() : (els.gwImageUrl.value || "").trim()),
      profileUrl: (els.gwProfileUrl.value || "").trim(),
      updatedAt: Date.now()
    };

    if (id) {
      await setDoc(doc(db, GENERAL_WINNERS_COLLECTION, id), payload, { merge: true });
      showToast('success', 'Ganhador geral atualizado!');
    } else {
      payload.createdAt = Date.now();
      const ref = await addDoc(collection(db, GENERAL_WINNERS_COLLECTION), payload);
      els.gwId.value = ref.id;
      showToast('success', 'Ganhador geral salvo!');
    }

    await loadGeneralWinners();
  } catch (e) {
    console.error(e);
    showToast('error', 'Erro ao salvar ganhador geral');
  }
}


async function saveQuizItem(item) {
  try {
    if (item.id) {
      // Atualizar documento existente
      const docRef = doc(db, QUIZ_COLLECTION, item.id);
      const { id, createdAt, ...data } = item;
      data.updatedAt = data.updatedAt || Date.now();
      await updateDoc(docRef, data);
    } else {
      // Verificar limite de 3 itens
      if (quizList.length >= 3) {
        // Remover o mais antigo (menor createdAt)
        const oldestQuiz = quizList.reduce((oldest, current) => 
          (oldest.createdAt < current.createdAt) ? oldest : current
        );
        await deleteDoc(doc(db, QUIZ_COLLECTION, oldestQuiz.id));
      }
      
      // Criar novo documento
      const { id, ...data } = item;
      data.createdAt = data.createdAt || Date.now();
      data.updatedAt = data.updatedAt || Date.now();
      await addDoc(collection(db, QUIZ_COLLECTION), data);
    }
    await loadQuiz();
    return true;
  } catch (error) {
    console.error("Erro ao salvar quiz:", error);
    showToast('error', 'Erro ao salvar', 'Não foi possível salvar o ganhador.');
    return false;
  }
}

async function deleteQuizItem(id) {
  try {
    await deleteDoc(doc(db, QUIZ_COLLECTION, id));
    await loadQuiz();
    return true;
  } catch (error) {
    console.error("Erro ao excluir quiz:", error);
    showToast('error', 'Erro ao excluir', 'Não foi possível excluir o ganhador.');
    return false;
  }
}

// ===== DASHBOARD STATS =====
function updateDashboardStats() {
  // Total de cards de notícias
  els.statTotalCards.textContent = newsList.length;
  
  // Contar por destino
  const whatsappCount = newsList.filter(item => item.targetType === 'whatsapp').length;
  const instagramCount = newsList.filter(item => item.targetType === 'instagram').length;
  
  els.statWhatsApp.textContent = whatsappCount;
  els.statInstagram.textContent = instagramCount;
  
  // Contar categorias únicas
  const categories = [...new Set(newsList.map(item => item.category).filter(Boolean))];
  els.statCategories.textContent = categories.length;
  
  // Total de parceiros
  els.statTotalPartners.textContent = partnersList.length;
  
  // Total de cards gaming
  els.statTotalGaming.textContent = gamingList.length;
}

// ===== NAVEGAÇÃO ENTRE SECTIONS =====
function showSection(sectionId) {
  // Esconder todas as seções
  [els.dashboardSection, els.newsSection, els.partnersSection, els.gamingSection, els.quizSection, els.settingsSection].forEach(section => {
    section.classList.add('section-hidden');
  });

  // Mostrar a seção selecionada
  document.getElementById(sectionId + 'Section').classList.remove('section-hidden');

  if (sectionId === 'dashboard') {
    loadGoatcounterPanel(7);
  }


  // Atualizar título da página
  const sectionTitles = {
    'dashboard': { title: 'Dashboard', subtitle: 'Painel administrativo - Ottaku Brasil' },
    'news': { title: 'Novidades / Notícias', subtitle: 'Edite os cards que aparecem na página pública' },
    'partners': { title: 'Parceiros', subtitle: 'Gerencie os parceiros da comunidade' },
    'gaming': { title: 'Gaming', subtitle: 'Gerencie cards de jogos e guildas' },
    'quiz': { title: 'Rank Quiz', subtitle: 'Gerencie os últimos ganhadores dos quizzes' },
    'settings': { title: 'Configurações', subtitle: 'Links, Livepix e ganhadores gerais' }
  };

  els.pageTitle.textContent = sectionTitles[sectionId].title;
  els.pageSubtitle.textContent = sectionTitles[sectionId].subtitle;

  // Atualizar menu ativo
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-section') === sectionId) {
      item.classList.add('active');
    }
  });

  // Fechar menu no mobile
  if (window.innerWidth < 900 && els.sidebar.classList.contains('open')) {
    toggleSidebar();
  }

  // Atualizar lista se for parceiros
  if (sectionId === 'partners') {
    renderPartnersTable();
  }
  
  // Atualizar lista se for gaming
  if (sectionId === 'gaming') {
    renderGamingTable();
  }
  
  // Atualizar lista se for quiz
  if (sectionId === 'quiz') {
    renderQuizTable();
    updateQuizPreview();
  }
}

// ===== MENU SLIDE =====
const toggleSidebar = () => {
  const isOpen = els.sidebar.classList.contains("open");
  if (isOpen) {
    els.sidebar.classList.remove("open");
    els.burgerBtn.classList.remove("active");
  } else {
    els.sidebar.classList.add("open");
    els.burgerBtn.classList.add("active");
  }
};

els.burgerBtn.addEventListener("click", toggleSidebar);

// Fecha o menu ao clicar fora (apenas em telas pequenas)
document.addEventListener("click", (e) => {
  if (window.innerWidth >= 900) return;
  if (!els.sidebar.classList.contains("open")) return;
  const clickInsideSidebar = els.sidebar.contains(e.target);
  const clickOnBurger = els.burgerBtn.contains(e.target);
  if (!clickInsideSidebar && !clickOnBurger) {
    toggleSidebar();
  }
});

// ===== NAVEGAÇÃO DO MENU =====
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.getAttribute('data-section');
    showSection(section);
  });
});

// Botão "Criar nova notícia" no menu
els.btnNovaNoticia.addEventListener("click", (e) => {
  e.preventDefault();
  showSection('news');
  clearForm();
  // Mantém a posição do usuário (não rolar para o topo)
});

// Botão "Adicionar parceiro" no menu
els.btnNovoParceiro.addEventListener("click", (e) => {
  e.preventDefault();
  showSection('partners');
  clearPartnerForm();
  // Mantém a posição do usuário (não rolar para o topo)
});

// Botão "Adicionar gaming" no menu
els.btnNovoGaming.addEventListener("click", (e) => {
  e.preventDefault();
  showSection('gaming');
  clearGamingForm();
  // Mantém a posição do usuário (não rolar para o topo)
});

// Botão "Adicionar ganhador" no menu
els.btnNovoQuiz.addEventListener("click", (e) => {
  e.preventDefault();
  showSection('quiz');
  clearQuizForm();
  // Mantém a posição do usuário (não rolar para o topo)
});

// Botão "Ver site"
els.btnVerSite.addEventListener("click", (e) => {
  e.preventDefault();
  window.open('https://ottakubrasil.online', '_blank');
});

// ===== SETTINGS LISTENERS =====
if (els.btnSaveLinks) els.btnSaveLinks.addEventListener('click', (e) => { e.preventDefault(); saveSiteLinks(); });
if (els.btnSaveLivepix) els.btnSaveLivepix.addEventListener('click', (e) => { e.preventDefault(); saveLivepix(); });
if (els.btnSaveGeneralWinner) els.btnSaveGeneralWinner.addEventListener('click', (e) => { e.preventDefault(); saveGeneralWinner(); });

// Troca de categoria no formulário de ganhadores gerais
if (els.gwCategory) {
  els.gwCategory.addEventListener('change', () => {
    // sem limite: categoria não carrega nada automaticamente
    if (els.gwId) els.gwId.value = '';
  });
}
// Botão criar notícia no dashboard
els.dashboardCreateBtn.addEventListener('click', () => {
  showSection('news');
  clearForm();
});

// Botão criar parceiro no dashboard
els.dashboardCreatePartnerBtn.addEventListener('click', () => {
  showSection('partners');
  clearPartnerForm();
});

// Botão criar gaming no dashboard
els.dashboardCreateGamingBtn.addEventListener('click', () => {
  showSection('gaming');
  clearGamingForm();
});

// ===== NEWS PREVIEW =====
function formatDateToPreview(value) {
  if (!value) return "DD MMM AAAA";
  try {
    const date = new Date(value + "T00:00:00");
    const opts = { day: "2-digit", month: "short", year: "numeric" };
    return date.toLocaleDateString("en-GB", opts).replace(",", "");
  } catch {
    return value;
  }
}

function getDestinoMeta(tipo) {
  let iconHtml = '';
  let label = '';
  
  switch (tipo) {
    case "whatsapp":
      iconHtml = '<i class="fab fa-whatsapp"></i>';
      label = "Ler no WhatsApp";
      break;
    case "instagram":
      iconHtml = '<i class="fab fa-instagram"></i>';
      label = "Ver no Instagram";
      break;
    case "site":
      iconHtml = '<i class="fas fa-external-link-alt"></i>';
      label = "Ler matéria completa";
      break;
    default:
      iconHtml = '<i class="fas fa-external-link-alt"></i>';
      label = "Ver destino";
      break;
  }
  
  return { icon: iconHtml, label };
}

function updatePreviewFromForm() {
  const title = els.title.value.trim();
  const excerpt = els.excerpt.value.trim();
  const category = els.category.value.trim();
  const imageUrl = (window.__newsImage ? window.__newsImage.getFinalValue() : els.imageUrl.value.trim());
  const date = els.date.value;
  const accentColor = els.accentColor.value || "#22c55e";
  const targetType = els.targetType.value;
  const targetUrl = els.targetUrl.value.trim();

  const destinoMeta = getDestinoMeta(targetType);

  // Atualiza cor principal
  els.previewCard.style.setProperty("--preview-accent", accentColor);
  
  // Imagem / fundo
  if (imageUrl) {
    els.previewImage.style.backgroundImage =
      "url('" +
      imageUrl.replace(/'/g, "\\'") +
      "'), linear-gradient(120deg,#e2e8f0,#f1f5f9)";
  } else {
    els.previewImage.style.backgroundImage =
      "linear-gradient(120deg,#e2e8f0,#f1f5f9)";
  }

  // Categoria
  els.previewCategory.textContent = category || "Categoria";
  els.previewCategory.style.background = accentColor;
  els.previewCategory.style.color = "#ffffff";

  // Data
  if (date) {
    els.previewDateRow.style.display = "flex";
    els.previewDate.textContent = formatDateToPreview(date);
  } else {
    els.previewDateRow.style.display = "flex";
    els.previewDate.textContent = "21 Jan 2026";
  }

  // Título
  els.previewTitle.textContent =
    title || "Dragon Ball Daima - Novo Arco Revelado";

  // Mini descrição
  els.previewExcerpt.textContent =
    excerpt ||
    "Akira Toriyama surpreende fãs com novo arco do anime Dragon Ball Daima!";

  // Botão
  els.previewCta.href = targetUrl || "#";
  els.previewCtaLabel.textContent = destinoMeta.label;
  els.previewCtaIcon.innerHTML = destinoMeta.icon;
  
  // Cor do texto do botão CTA
  els.previewCta.style.color = accentColor;
}

// ===== PARTNERS PREVIEW =====
function updatePartnerPreview() {
  const iconSelect = els.partnerIconSelect.value;
  const color = els.partnerColor.value || "#fbbf24";
  const name = els.partnerName.value.trim();
  const subname = els.partnerSubname.value.trim();
  const category = els.partnerCategory.value.trim();
  const description = els.partnerDescription.value.trim();
  const subDescIcon = els.partnerSubDescIcon.value || "fas fa-users";
  const subDesc = els.partnerSubDesc.value.trim();
  const destSymbol = els.partnerDestSymbol.value;

  // Atualizar cor principal
  els.previewPartnerCard.style.setProperty("--partner-accent", color);
  
  // Atualizar quadrado de ícone
  els.previewPartnerIconSquare.style.background = color;
  els.previewPartnerIconSquare.style.borderColor = color;
  els.previewPartnerIcon.className = iconSelect;
  els.previewPartnerIcon.style.color = "#ffffff";
  
  // Atualizar título, subtítulo e categoria
  els.previewPartnerName.textContent = name || "Jornal Geek";
  els.previewPartnerSubname.textContent = subname || "Comunidade";
  els.previewPartnerCategory.textContent = (category || "CANAL").toUpperCase();
  els.previewPartnerCategory.style.background = color + "20";
  els.previewPartnerCategory.style.color = color;
  els.previewPartnerCategory.style.borderColor = color + "50";
  
  // Atualizar descrição
  els.previewPartnerDescription.textContent = description || 
    "Comunidade brasileira de otakus com notícias sobre o mundo geek.";
  
  // Atualizar subdescrição
  els.previewPartnerSubdescIcon.className = subDescIcon;
  els.previewPartnerSubdescIcon.style.color = color;
  els.previewPartnerSubdescText.textContent = subDesc || "+500 membros";
  
  // Atualizar destino
  els.previewPartnerDestIcon.className = destSymbol;
  els.previewPartnerDestination.style.color = color;
}

// ===== GAMING PREVIEW =====
function updateGamingPreview() {
  const iconSelect = els.gamingIconSelect.value;
  const gradientColor1 = els.gamingGradientColor1.value || "#8b5cf6";
  const gradientColor2 = els.gamingGradientColor2.value || "#3b82f6";
  const title = els.gamingTitle.value.trim();
  const subtitle = els.gamingSubtitle.value.trim();
  const title2 = els.gamingTitle2.value.trim();
  const description = els.gamingDescription.value.trim();
  const minicardTitle = els.minicardTitle.value.trim();
  const event1Title = els.minicardEvent1Title.value.trim();
  const event1Value = els.minicardEvent1Value.value.trim();
  const event1Sub = els.minicardEvent1Sub.value.trim();
  const event1Color = els.minicardEvent1Color.value || "#ef4444";
  const event2Title = els.minicardEvent2Title.value.trim();
  const event2Value = els.minicardEvent2Value.value.trim();
  const event2Sub = els.minicardEvent2Sub.value.trim();
  const event2Color = els.minicardEvent2Color.value || "#10b981";
  const buttonText = els.gamingButtonText.value.trim();
  const buttonIcon = els.gamingButtonIcon.value;
  const buttonLink = els.gamingButtonLink.value.trim();
  const buttonColor = els.gamingButtonColor.value || "#8b5cf6";
  const bottomText = els.gamingBottomText.value.trim();

  // Atualizar gradiente no quadrado do ícone
  els.previewGamingIconSquare.style.background = `linear-gradient(135deg, ${gradientColor1}, ${gradientColor2})`;
  els.previewGamingIcon.className = iconSelect;
  els.previewGamingIcon.style.color = "#ffffff";
  
  // Atualizar título e subtítulo
  els.previewGamingTitle.textContent = title || "Free Fire";
  els.previewGamingSubtitle.textContent = subtitle || "Guilda Ativa";
  els.previewGamingTitle2.textContent = title2 || "Nossa Guilda";
  els.previewGamingDescription.textContent = description || 
    "Guilda ativa com membros dedicados, salas personalizadas e prêmios semanais.";
  
  // Atualizar mini card (sempre visível)
  els.previewMinicard.style.display = "block";
  
  // Título do mini card
  els.previewMinicardTitle.textContent = minicardTitle || "Principais Eventos";
  
  // Limpar eventos anteriores
  els.previewMinicardEvents.innerHTML = "";
  
  // Adicionar evento 1 (sempre)
  if (event1Title || event1Value || event1Sub) {
    const eventDiv = createMinicardEvent(event1Title, event1Value, event1Sub, event1Color);
    els.previewMinicardEvents.appendChild(eventDiv);
  }
  
  // Adicionar evento 2 (sempre)
  if (event2Title || event2Value || event2Sub) {
    const eventDiv = createMinicardEvent(event2Title, event2Value, event2Sub, event2Color);
    els.previewMinicardEvents.appendChild(eventDiv);
  }
  
  // Se não houver eventos, mostrar mensagem (não deve acontecer pois são obrigatórios)
  if (els.previewMinicardEvents.children.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "minicard-event";
    emptyDiv.innerHTML = '<span class="minicard-event-sub">Nenhum evento configurado</span>';
    els.previewMinicardEvents.appendChild(emptyDiv);
  }
  
  // Atualizar botão
  els.previewGamingButton.href = buttonLink || "#";
  els.previewGamingButtonIcon.className = buttonIcon;
  els.previewGamingButtonText.textContent = buttonText || "Entrar na Guilda";
  els.previewGamingButton.style.background = buttonColor;
  
  // Atualizar texto abaixo do botão
  els.previewGamingBottomText.textContent = bottomText || "Vagas limitadas - Apenas jogadores ativos";
}

// Função auxiliar para criar eventos do mini card
function createMinicardEvent(title, value, sub, color) {
  const eventDiv = document.createElement("div");
  eventDiv.className = "minicard-event";
  
  const headerDiv = document.createElement("div");
  headerDiv.className = "minicard-event-header";
  
  const titleSpan = document.createElement("span");
  titleSpan.className = "minicard-event-title";
  titleSpan.textContent = title || "Evento";
  
  const valueSpan = document.createElement("span");
  valueSpan.className = "minicard-event-value";
  valueSpan.textContent = value || "Valor";
  valueSpan.style.background = color;
  valueSpan.style.color = "#ffffff";
  valueSpan.style.borderColor = color + "80";
  
  headerDiv.appendChild(titleSpan);
  headerDiv.appendChild(valueSpan);
  
  const subSpan = document.createElement("span");
  subSpan.className = "minicard-event-sub";
  subSpan.textContent = sub || "Subtexto do evento";
  
  eventDiv.appendChild(headerDiv);
  eventDiv.appendChild(subSpan);
  
  return eventDiv;
}

// ===== QUIZ PREVIEW EM TEMPO REAL =====
function updateQuizPreview() {
  // Obter valores do formulário
  const photoUrl = (window.__quizPhoto ? window.__quizPhoto.getFinalValue() : els.quizPhotoUrl.value.trim());
  const name = els.quizName.value.trim();
  const prize = els.quizPrize.value.trim();
  const link = els.quizLink.value.trim();
  
  // Se houver valores no formulário, mostrar no primeiro slot
  if (photoUrl || name || prize || link) {
    // Atualizar primeiro slot com dados do formulário
    document.getElementById('previewQuizPhoto1').src = photoUrl || '';
    document.getElementById('previewQuizName1').textContent = name || '@usuário1';
    document.getElementById('previewQuizPrize1').textContent = prize || 'R$0';
    document.getElementById('previewQuizLink1').href = link || '#';
    
    // Se a imagem não carregar, mostrar fundo cinza
    document.getElementById('previewQuizPhoto1').onerror = function() {
      this.style.display = 'none';
      this.parentElement.style.background = '#e2e8f0';
    };
    
    // Mostrar outros slots com dados salvos
    const recentWinners = [...quizList]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 2); // Pegar apenas 2 porque o primeiro slot é do formulário
    
    for (let i = 0; i < 2; i++) {
      const winner = recentWinners[i];
      const photoEl = document.getElementById(`previewQuizPhoto${i + 2}`);
      const nameEl = document.getElementById(`previewQuizName${i + 2}`);
      const prizeEl = document.getElementById(`previewQuizPrize${i + 2}`);
      const linkEl = document.getElementById(`previewQuizLink${i + 2}`);
      
      if (winner) {
        photoEl.src = winner.photoUrl || '';
        photoEl.alt = winner.name || '';
        nameEl.textContent = winner.name || `@usuário${i + 2}`;
        prizeEl.textContent = winner.prize || 'R$0';
        linkEl.href = winner.link || '#';
        photoEl.style.display = 'block';
        photoEl.parentElement.style.background = 'transparent';
      } else {
        photoEl.src = '';
        nameEl.textContent = `@usuário${i + 2}`;
        prizeEl.textContent = 'R$0';
        linkEl.href = '#';
        photoEl.style.display = 'none';
        photoEl.parentElement.style.background = '#e2e8f0';
      }
    }
  } else {
    // Se o formulário estiver vazio, mostrar todos os slots com dados salvos
    const recentWinners = [...quizList]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3);
    
    for (let i = 0; i < 3; i++) {
      const winner = recentWinners[i];
      const photoEl = document.getElementById(`previewQuizPhoto${i + 1}`);
      const nameEl = document.getElementById(`previewQuizName${i + 1}`);
      const prizeEl = document.getElementById(`previewQuizPrize${i + 1}`);
      const linkEl = document.getElementById(`previewQuizLink${i + 1}`);
      
      if (winner) {
        photoEl.src = winner.photoUrl || '';
        photoEl.alt = winner.name || '';
        nameEl.textContent = winner.name || `@usuário${i + 1}`;
        prizeEl.textContent = winner.prize || 'R$0';
        linkEl.href = winner.link || '#';
        photoEl.style.display = 'block';
        photoEl.parentElement.style.background = 'transparent';
      } else {
        photoEl.src = '';
        nameEl.textContent = `@usuário${i + 1}`;
        prizeEl.textContent = 'R$0';
        linkEl.href = '#';
        photoEl.style.display = 'none';
        photoEl.parentElement.style.background = '#e2e8f0';
      }
    }
  }
}


let newsListHidden = false;

function updateNewsListVisibility() {
  if (!els.newsTableWrapper) return;
  const hidden = newsListHidden;
  els.newsTableWrapper.style.display = hidden ? "none" : "block";

  if (els.newsToggleListLabel) els.newsToggleListLabel.textContent = hidden ? "Mostrar" : "Ocultar";
  if (els.newsToggleListBtn) {
    const icon = els.newsToggleListBtn.querySelector("i");
    if (icon) icon.className = hidden ? "fas fa-eye" : "fas fa-eye-slash";
  }
}

// ===== NEWS LISTAGEM =====
function renderNewsTable() {
  els.newsTableBody.innerHTML = "";

  // Filtro (pesquisa)
  const q = (els.newsSearchInput ? els.newsSearchInput.value : "").trim().toLowerCase();
  const filtered = !q
    ? newsList.slice()
    : newsList.filter((item) => {
        const hay = [
          item.title,
          item.category,
          item.excerpt,
          item.targetType,
          item.targetUrl,
          item.date
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });

  // Badge: mostra total ou "filtrado/total"
  if (!newsList.length) {
    els.tableEmpty.style.display = "block";
    els.totalCardsBadge.textContent = "0 itens";
    updateNewsListVisibility();
    return;
  }

  els.tableEmpty.style.display = filtered.length ? "none" : "block";
  if (q) {
    els.totalCardsBadge.textContent = `${filtered.length}/${newsList.length} itens`;
  } else {
    els.totalCardsBadge.textContent =
      newsList.length + (newsList.length === 1 ? " item" : " itens");
  }

  if (!filtered.length) {
    updateNewsListVisibility();
    return;
  }

  filtered
    .slice()
    .sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) {
        return a.date > b.date ? -1 : 1;
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    })
    .forEach((item) => {
      const tr = document.createElement("tr");

      const tdTitle = document.createElement("td");
      tdTitle.textContent = item.title || "(Sem título)";
      tdTitle.style.fontSize = "14px";
      tdTitle.style.fontWeight = "500";
      tdTitle.style.padding = "14px 16px";

      const tdCat = document.createElement("td");
      const spanCat = document.createElement("span");
      spanCat.className = "badge-pill";
      spanCat.textContent = item.category || "Sem cat.";
      spanCat.style.borderColor = item.color || "#22c55e";
      spanCat.style.backgroundColor = item.color ? item.color + "20" : "rgba(34,197,94,0.12)";
      spanCat.style.color = item.color || "#166534";
      tdCat.appendChild(spanCat);

      const tdDestino = document.createElement("td");
      const spanDest = document.createElement("span");
      spanDest.className = "badge-destino";

      let destinoIcon = '';
      if (item.targetType === 'whatsapp') destinoIcon = '<i class="fab fa-whatsapp"></i>';
      else if (item.targetType === 'instagram') destinoIcon = '<i class="fab fa-instagram"></i>';
      else if (item.targetType === 'site') destinoIcon = '<i class="fas fa-external-link-alt"></i>';
      else destinoIcon = '<i class="fas fa-external-link-alt"></i>';

      spanDest.innerHTML = destinoIcon;
      tdDestino.appendChild(spanDest);

      const tdActions = document.createElement("td");
      tdActions.style.whiteSpace = "nowrap";
      tdActions.style.padding = "14px 16px";

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-ghost";
      btnEdit.style.padding = "6px 12px";
      btnEdit.style.fontSize = "12px";
      btnEdit.style.marginRight = "6px";
      btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
      btnEdit.title = "Editar";
      btnEdit.addEventListener("click", () => loadItemIntoForm(item.id));

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn-ghost";
      btnDel.style.padding = "6px 12px";
      btnDel.style.fontSize = "12px";
      btnDel.innerHTML = '<i class="fas fa-trash"></i>';
      btnDel.title = "Excluir";
      btnDel.style.color = "#ef4444";
      btnDel.addEventListener("click", () => deleteNewsItem(item.id));

      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnDel);

      tr.appendChild(tdTitle);
      tr.appendChild(tdCat);
      tr.appendChild(tdDestino);
      tr.appendChild(tdActions);

      els.newsTableBody.appendChild(tr);
    });

  updateNewsListVisibility();
}

async function deleteItem(id) {
  const item = newsList.find((n) => n.id === id);
  if (!item) return;

  const confirmMsg =
    "Tem certeza que deseja excluir o card:\n\n" +
    (item.title || "(Sem título)") +
    "\n\nEssa ação não pode ser desfeita.";
  if (!window.confirm(confirmMsg)) return;

  const success = await deleteNewsItem(id);
  if (success) {
    if (els.newsId.value === id) {
      clearForm();
    }
    showToast('success', 'Card excluído', 'O card foi removido com sucesso.');
  }
}

function loadItemIntoForm(id) {
  const item = newsList.find((n) => n.id === id);
  if (!item) return;

  els.newsId.value = item.id;
  els.title.value = item.title || "";
  // imagem pode ser link ou base64
  if (window.__newsImage) window.__newsImage.setFromValue(item.imageUrl || "");
  else els.imageUrl.value = item.imageUrl || "";
  els.excerpt.value = item.excerpt || "";
  els.category.value = item.category || "";
  els.accentColor.value = item.color || "#22c55e";
  els.date.value = item.date || "";
  els.targetType.value = item.targetType || "whatsapp";
  els.targetUrl.value = item.targetUrl || "";

  els.btnSubmitLabel.textContent = "Atualizar card";
  els.btnDeleteCurrent.style.display = "inline-flex";

  updatePreviewFromForm();
  // Mantém a posição do usuário (não rolar para o topo)
}

function clearForm() {
  els.newsId.value = "";
  els.newsForm.reset();
  if (window.__newsImage) window.__newsImage.setFromValue("");
  els.accentColor.value = "#22c55e";
  els.btnSubmitLabel.textContent = "Salvar card";
  els.btnDeleteCurrent.style.display = "none";
  updatePreviewFromForm();
}

els.btnReset.addEventListener("click", () => clearForm());

els.btnDeleteCurrent.addEventListener("click", () => {
  const id = els.newsId.value;
  if (!id) return;
  deleteItem(id);
});

// Controles (Ocultar/Mostrar e Pesquisa) - Novidades/Notícias
if (els.newsToggleListBtn) {
  els.newsToggleListBtn.addEventListener("click", () => {
    newsListHidden = !newsListHidden;
    updateNewsListVisibility();
  });
}
if (els.newsSearchInput) {
  els.newsSearchInput.addEventListener("input", () => {
    renderNewsTable();
  });
}

// ===== PARTNERS LISTAGEM =====
function renderPartnersTable() {
  els.partnersTableBody.innerHTML = "";

  if (!partnersList.length) {
    els.partnersTableEmpty.style.display = "block";
    els.totalPartnersBadge.textContent = "0 itens";
    return;
  }

  els.partnersTableEmpty.style.display = "none";
  els.totalPartnersBadge.textContent =
    partnersList.length + (partnersList.length === 1 ? " item" : " itens");

  partnersList
    .slice()
    .sort((a, b) => {
      return (b.createdAt || 0) - (a.createdAt || 0);
    })
    .forEach((item) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = item.name || "(Sem nome)";
      tdName.style.fontSize = "14px";
      tdName.style.fontWeight = "500";
      tdName.style.padding = "14px 16px";

      const tdCat = document.createElement("td");
      const spanCat = document.createElement("span");
      spanCat.className = "badge-pill";
      spanCat.textContent = item.category || "Sem cat.";
      spanCat.style.borderColor = item.color || "#fbbf24";
      spanCat.style.backgroundColor = item.color ? item.color + "20" : "rgba(251, 191, 36, 0.12)";
      spanCat.style.color = item.color || "#92400e";
      tdCat.appendChild(spanCat);

      const tdDestino = document.createElement("td");
      const spanDest = document.createElement("span");
      spanDest.className = "badge-destino";
      
      spanDest.innerHTML = `<i class="${item.destSymbol || 'fab fa-instagram'}"></i>`;
      tdDestino.appendChild(spanDest);

      const tdActions = document.createElement("td");
      tdActions.style.whiteSpace = "nowrap";
      tdActions.style.padding = "14px 16px";
      
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-ghost";
      btnEdit.style.padding = "6px 12px";
      btnEdit.style.fontSize = "12px";
      btnEdit.style.marginRight = "6px";
      btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
      btnEdit.title = "Editar";
      btnEdit.addEventListener("click", () => loadPartnerIntoForm(item.id));

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn-danger";
      btnDel.style.padding = "6px 12px";
      btnDel.style.fontSize = "12px";
      btnDel.innerHTML = '<i class="fas fa-trash"></i>';
      btnDel.title = "Excluir";
      btnDel.addEventListener("click", () => deletePartner(item.id));

      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnDel);

      tr.appendChild(tdName);
      tr.appendChild(tdCat);
      tr.appendChild(tdDestino);
      tr.appendChild(tdActions);

      els.partnersTableBody.appendChild(tr);
    });
}

async function deletePartner(id) {
  const item = partnersList.find((p) => p.id === id);
  if (!item) return;

  const confirmMsg =
    "Tem certeza que deseja excluir o parceiro:\n\n" +
    (item.name || "(Sem nome)") +
    "\n\nEssa ação não pode ser desfeita.";
  if (!window.confirm(confirmMsg)) return;

  const success = await deletePartnerItem(id);
  if (success) {
    if (els.partnerId.value === id) {
      clearPartnerForm();
    }
    showToast('success', 'Parceiro excluído', 'O parceiro foi removido com sucesso.');
  }
}

function loadPartnerIntoForm(id) {
  const item = partnersList.find((p) => p.id === id);
  if (!item) return;

  els.partnerId.value = item.id;
  els.partnerIconSelect.value = item.iconSelect || "fas fa-newspaper";
  els.partnerColor.value = item.color || "#fbbf24";
  els.partnerName.value = item.name || "";
  els.partnerSubname.value = item.subname || "";
  els.partnerCategory.value = item.category || "";
  els.partnerDescription.value = item.description || "";
  els.partnerSubDescIcon.value = item.subDescIcon || "fas fa-users";
  els.partnerSubDesc.value = item.subDesc || "";
  els.partnerDestSymbol.value = item.destSymbol || "fab fa-instagram";
  els.partnerDestLink.value = item.destLink || "";

  els.btnPartnerSubmitLabel.textContent = "Atualizar parceiro";
  els.btnPartnerDeleteCurrent.style.display = "inline-flex";

  updatePartnerPreview();
  // Mantém a posição do usuário (não rolar para o topo)
}

function clearPartnerForm() {
  els.partnerId.value = "";
  els.partnerForm.reset();
  els.partnerColor.value = "#fbbf24";
  els.partnerIconSelect.value = "fas fa-newspaper";
  els.partnerSubDescIcon.value = "fas fa-users";
  els.btnPartnerSubmitLabel.textContent = "Salvar parceiro";
  els.btnPartnerDeleteCurrent.style.display = "none";
  updatePartnerPreview();
}

els.btnPartnerReset.addEventListener("click", () => clearPartnerForm());

els.btnPartnerDeleteCurrent.addEventListener("click", () => {
  const id = els.partnerId.value;
  if (!id) return;
  deletePartner(id);
});

// ===== GAMING LISTAGEM =====
function renderGamingTable() {
  els.gamingTableBody.innerHTML = "";

  if (!gamingList.length) {
    els.gamingTableEmpty.style.display = "block";
    els.totalGamingBadge.textContent = "0 itens";
    return;
  }

  els.gamingTableEmpty.style.display = "none";
  els.totalGamingBadge.textContent =
    gamingList.length + (gamingList.length === 1 ? " item" : " itens");

  gamingList
    .slice()
    .sort((a, b) => {
      return (b.createdAt || 0) - (a.createdAt || 0);
    })
    .forEach((item) => {
      const tr = document.createElement("tr");

      const tdTitle = document.createElement("td");
      tdTitle.textContent = item.title || "(Sem título)";
      tdTitle.style.fontSize = "14px";
      tdTitle.style.fontWeight = "500";
      tdTitle.style.padding = "14px 16px";

      const tdSubtitle = document.createElement("td");
      tdSubtitle.textContent = item.subtitle || "Sem subtítulo";
      tdSubtitle.style.fontSize = "13px";
      tdSubtitle.style.color = "var(--text-muted)";

      const tdEvents = document.createElement("td");
      const spanEvents = document.createElement("span");
      spanEvents.className = "badge-pill";
      const eventCount = [item.event1Title, item.event2Title].filter(e => e && e.trim()).length;
      spanEvents.textContent = `${eventCount} evento(s)`;
      spanEvents.style.borderColor = "#8b5cf6";
      spanEvents.style.backgroundColor = "rgba(139, 92, 246, 0.12)";
      spanEvents.style.color = "#7c3aed";
      tdEvents.appendChild(spanEvents);

      const tdActions = document.createElement("td");
      tdActions.style.whiteSpace = "nowrap";
      tdActions.style.padding = "14px 16px";
      
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-ghost";
      btnEdit.style.padding = "6px 12px";
      btnEdit.style.fontSize = "12px";
      btnEdit.style.marginRight = "6px";
      btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
      btnEdit.title = "Editar";
      btnEdit.addEventListener("click", () => loadGamingIntoForm(item.id));

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn-danger";
      btnDel.style.padding = "6px 12px";
      btnDel.style.fontSize = "12px";
      btnDel.innerHTML = '<i class="fas fa-trash"></i>';
      btnDel.title = "Excluir";
      btnDel.addEventListener("click", () => deleteGaming(item.id));

      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnDel);

      tr.appendChild(tdTitle);
      tr.appendChild(tdSubtitle);
      tr.appendChild(tdEvents);
      tr.appendChild(tdActions);

      els.gamingTableBody.appendChild(tr);
    });
}

async function deleteGaming(id) {
  const item = gamingList.find((g) => g.id === id);
  if (!item) return;

  const confirmMsg =
    "Tem certeza que deseja excluir o card gaming:\n\n" +
    (item.title || "(Sem título)") +
    "\n\nEssa ação não pode ser desfeita.";
  if (!window.confirm(confirmMsg)) return;

  const success = await deleteGamingItem(id);
  if (success) {
    if (els.gamingId.value === id) {
      clearGamingForm();
    }
    showToast('success', 'Card excluído', 'O card gaming foi removido com sucesso.');
  }
}

function loadGamingIntoForm(id) {
  const item = gamingList.find((g) => g.id === id);
  if (!item) return;

  els.gamingId.value = item.id;
  els.gamingIconSelect.value = item.iconSelect || "fas fa-gamepad";
  els.gamingGradientColor1.value = item.gradientColor1 || "#8b5cf6";
  els.gamingGradientColor2.value = item.gradientColor2 || "#3b82f6";
  els.gamingTitle.value = item.title || "";
  els.gamingSubtitle.value = item.subtitle || "";
  els.gamingTitle2.value = item.title2 || "";
  els.gamingDescription.value = item.description || "";
  els.minicardTitle.value = item.minicardTitle || "";
  els.minicardEvent1Title.value = item.event1Title || "";
  els.minicardEvent1Value.value = item.event1Value || "";
  els.minicardEvent1Sub.value = item.event1Sub || "";
  els.minicardEvent1Color.value = item.event1Color || "#ef4444";
  els.minicardEvent2Title.value = item.event2Title || "";
  els.minicardEvent2Value.value = item.event2Value || "";
  els.minicardEvent2Sub.value = item.event2Sub || "";
  els.minicardEvent2Color.value = item.event2Color || "#10b981";
  els.gamingButtonText.value = item.buttonText || "";
  els.gamingButtonIcon.value = item.buttonIcon || "fab fa-whatsapp";
  els.gamingButtonLink.value = item.buttonLink || "";
  els.gamingButtonColor.value = item.buttonColor || "#8b5cf6";
  els.gamingBottomText.value = item.bottomText || "";

  els.btnGamingSubmitLabel.textContent = "Atualizar card gaming";
  els.btnGamingDeleteCurrent.style.display = "inline-flex";

  updateGamingPreview();
  // Mantém a posição do usuário (não rolar para o topo)
}

function clearGamingForm() {
  els.gamingId.value = "";
  els.gamingForm.reset();
  els.gamingGradientColor1.value = "#8b5cf6";
  els.gamingGradientColor2.value = "#3b82f6";
  els.gamingIconSelect.value = "fas fa-gamepad";
  els.gamingButtonIcon.value = "fab fa-whatsapp";
  els.gamingButtonColor.value = "#8b5cf6";
  els.minicardEvent1Color.value = "#ef4444";
  els.minicardEvent2Color.value = "#10b981";
  els.btnGamingSubmitLabel.textContent = "Salvar card gaming";
  els.btnGamingDeleteCurrent.style.display = "none";
  updateGamingPreview();
}

els.btnGamingReset.addEventListener("click", () => clearGamingForm());

els.btnGamingDeleteCurrent.addEventListener("click", () => {
  const id = els.gamingId.value;
  if (!id) return;
  deleteGaming(id);
});

// ===== QUIZ LISTAGEM =====
function renderQuizTable() {
  els.quizTableBody.innerHTML = "";

  if (!quizList.length) {
    els.quizTableEmpty.style.display = "block";
    els.totalQuizBadge.textContent = "0 itens";
    return;
  }

  els.quizTableEmpty.style.display = "none";
  els.totalQuizBadge.textContent =
    quizList.length + (quizList.length === 1 ? " item" : " itens") + " (máx: 3)";

  quizList
    .slice()
    .sort((a, b) => {
      return (b.createdAt || 0) - (a.createdAt || 0);
    })
    .forEach((item) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = item.name || "(Sem nome)";
      tdName.style.fontSize = "14px";
      tdName.style.fontWeight = "500";
      tdName.style.padding = "14px 16px";

      const tdPrize = document.createElement("td");
      const spanPrize = document.createElement("span");
      spanPrize.className = "badge-pill";
      spanPrize.textContent = item.prize || "R$0";
      spanPrize.style.borderColor = "#8b5cf6";
      spanPrize.style.backgroundColor = "rgba(139, 92, 246, 0.12)";
      spanPrize.style.color = "#7c3aed";
      tdPrize.appendChild(spanPrize);

      const tdActions = document.createElement("td");
      tdActions.style.whiteSpace = "nowrap";
      tdActions.style.padding = "14px 16px";
      
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-ghost";
      btnEdit.style.padding = "6px 12px";
      btnEdit.style.fontSize = "12px";
      btnEdit.style.marginRight = "6px";
      btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
      btnEdit.title = "Editar";
      btnEdit.addEventListener("click", () => loadQuizIntoForm(item.id));

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn-danger";
      btnDel.style.padding = "6px 12px";
      btnDel.style.fontSize = "12px";
      btnDel.innerHTML = '<i class="fas fa-trash"></i>';
      btnDel.title = "Excluir";
      btnDel.addEventListener("click", () => deleteQuiz(item.id));

      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnDel);

      tr.appendChild(tdName);
      tr.appendChild(tdPrize);
      tr.appendChild(tdActions);

      els.quizTableBody.appendChild(tr);
    });
}

async function deleteQuiz(id) {
  const item = quizList.find((q) => q.id === id);
  if (!item) return;

  const confirmMsg =
    "Tem certeza que deseja excluir o ganhador:\n\n" +
    (item.name || "(Sem nome)") +
    "\n\nEssa ação não pode ser desfeita.";
  if (!window.confirm(confirmMsg)) return;

  const success = await deleteQuizItem(id);
  if (success) {
    if (els.quizId.value === id) {
      clearQuizForm();
    }
    showToast('success', 'Ganhador excluído', 'O ganhador foi removido com sucesso.');
  }
}

function loadQuizIntoForm(id) {
  const item = quizList.find((q) => q.id === id);
  if (!item) return;

  els.quizId.value = item.id;
  if (window.__quizPhoto) window.__quizPhoto.setFromValue(item.photoUrl || "");
  else els.quizPhotoUrl.value = item.photoUrl || "";
  els.quizName.value = item.name || "";
  els.quizPrize.value = item.prize || "";
  els.quizLink.value = item.link || "";

  els.btnQuizSubmitLabel.textContent = "Atualizar ganhador";
  els.btnQuizDeleteCurrent.style.display = "inline-flex";

  updateQuizPreview();
  // Mantém a posição do usuário (não rolar para o topo)
}

function clearQuizForm() {
  els.quizId.value = "";
  els.quizForm.reset();
  if (window.__quizPhoto) window.__quizPhoto.setFromValue("");
  els.btnQuizSubmitLabel.textContent = "Salvar ganhador";
  els.btnQuizDeleteCurrent.style.display = "none";
  updateQuizPreview();
}

els.btnQuizReset.addEventListener("click", () => clearQuizForm());

els.btnQuizDeleteCurrent.addEventListener("click", () => {
  const id = els.quizId.value;
  if (!id) return;
  deleteQuiz(id);
});

// ===== SUBMISSÃO DO FORM NEWS =====
els.newsForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = els.newsId.value;
  const finalNewsImage = (window.__newsImage ? window.__newsImage.getFinalValue() : (els.imageUrl?.value || "").trim());
  if (!finalNewsImage) {
    showToast('error', 'Foto', 'Escolha uma imagem (Base64) ou cole um link.');
    return;
  }

  const payload = {
    title: els.title.value.trim(),
    imageUrl: (window.__newsImage ? window.__newsImage.getFinalValue() : els.imageUrl.value.trim()),
    excerpt: els.excerpt.value.trim(),
    category: els.category.value.trim(),
    color: els.accentColor.value || "#22c55e",
    date: els.date.value || "",
    targetType: els.targetType.value,
    targetUrl: els.targetUrl.value.trim(),
    updatedAt: Date.now(),
  };

    if (!id) {
    payload.createdAt = Date.now();
  }

if (id) {
    payload.id = id;
  }

  const success = await saveNewsItem(payload);
  if (success) {
    const message = id ? "Card atualizado com sucesso!" : "Card criado com sucesso!";
    showToast('success', 'Sucesso', message);
    els.newsId.value = id || "";
    els.btnSubmitLabel.textContent = "Atualizar card";
    els.btnDeleteCurrent.style.display = "inline-flex";
  }
});

// ===== SUBMISSÃO DO FORM PARTNERS =====
els.partnerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = els.partnerId.value;

  const payload = {
    iconSelect: els.partnerIconSelect.value,
    color: els.partnerColor.value || "#fbbf24",
    name: els.partnerName.value.trim(),
    subname: els.partnerSubname.value.trim(),
    category: els.partnerCategory.value.trim(),
    description: els.partnerDescription.value.trim(),
    subDescIcon: els.partnerSubDescIcon.value || "fas fa-users",
    subDesc: els.partnerSubDesc.value.trim(),
    destSymbol: els.partnerDestSymbol.value,
    destLink: els.partnerDestLink.value.trim(),
    updatedAt: Date.now(),
  };

    if (!id) {
    payload.createdAt = Date.now();
  }

if (id) {
    payload.id = id;
  }

  const success = await savePartnerItem(payload);
  if (success) {
    const message = id ? "Parceiro atualizado com sucesso!" : "Parceiro criado com sucesso!";
    showToast('success', 'Sucesso', message);
    els.partnerId.value = id || "";
    els.btnPartnerSubmitLabel.textContent = "Atualizar parceiro";
    els.btnPartnerDeleteCurrent.style.display = "inline-flex";
  }
});

// ===== SUBMISSÃO DO FORM GAMING =====
els.gamingForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = els.gamingId.value;

  const payload = {
    iconSelect: els.gamingIconSelect.value,
    gradientColor1: els.gamingGradientColor1.value || "#8b5cf6",
    gradientColor2: els.gamingGradientColor2.value || "#3b82f6",
    title: els.gamingTitle.value.trim(),
    subtitle: els.gamingSubtitle.value.trim(),
    title2: els.gamingTitle2.value.trim(),
    description: els.gamingDescription.value.trim(),
    minicardTitle: els.minicardTitle.value.trim(),
    event1Title: els.minicardEvent1Title.value.trim(),
    event1Value: els.minicardEvent1Value.value.trim(),
    event1Sub: els.minicardEvent1Sub.value.trim(),
    event1Color: els.minicardEvent1Color.value || "#ef4444",
    event2Title: els.minicardEvent2Title.value.trim(),
    event2Value: els.minicardEvent2Value.value.trim(),
    event2Sub: els.minicardEvent2Sub.value.trim(),
    event2Color: els.minicardEvent2Color.value || "#10b981",
    buttonText: els.gamingButtonText.value.trim(),
    buttonIcon: els.gamingButtonIcon.value,
    buttonLink: els.gamingButtonLink.value.trim(),
    buttonColor: els.gamingButtonColor.value || "#8b5cf6",
    bottomText: els.gamingBottomText.value.trim(),
    updatedAt: Date.now(),
  };

    if (!id) {
    payload.createdAt = Date.now();
  }

if (id) {
    payload.id = id;
  }

  const success = await saveGamingItem(payload);
  if (success) {
    const message = id ? "Card gaming atualizado com sucesso!" : "Card gaming criado com sucesso!";
    showToast('success', 'Sucesso', message);
    els.gamingId.value = id || "";
    els.btnGamingSubmitLabel.textContent = "Atualizar card gaming";
    els.btnGamingDeleteCurrent.style.display = "inline-flex";
  }
});

// ===== SUBMISSÃO DO FORM QUIZ =====
els.quizForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = els.quizId.value;
  const finalQuizPhoto = (window.__quizPhoto ? window.__quizPhoto.getFinalValue() : (els.quizPhotoUrl?.value || "").trim());
  if (!finalQuizPhoto) {
    showToast('error', 'Foto', 'Escolha uma imagem (Base64) ou cole um link.');
    return;
  }

  const payload = {
    photoUrl: (window.__quizPhoto ? window.__quizPhoto.getFinalValue() : els.quizPhotoUrl.value.trim()),
    name: els.quizName.value.trim(),
    prize: els.quizPrize.value.trim(),
    link: els.quizLink.value.trim(),
    updatedAt: Date.now(),
  };

    if (!id) {
    payload.createdAt = Date.now();
  }

if (id) {
    payload.id = id;
  }

  const success = await saveQuizItem(payload);
  if (success) {
    const message = id ? "Ganhador atualizado com sucesso!" : "Ganhador adicionado com sucesso!";
    const extraMessage = quizList.length >= 3 ? "\n\nNota: Mantido o limite de 3 ganhadores. O mais antigo foi removido automaticamente." : "";
    showToast('success', 'Sucesso', message + extraMessage);
    els.quizId.value = id || "";
    els.btnQuizSubmitLabel.textContent = "Atualizar ganhador";
    els.btnQuizDeleteCurrent.style.display = "inline-flex";
  }
});

// Atualizar preview em tempo real (News)
[
  "title",
  "imageUrl",
  "excerpt",
  "category",
  "accentColor",
  "date",
  "targetType",
  "targetUrl",
].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", updatePreviewFromForm);
  el.addEventListener("change", updatePreviewFromForm);
});

// Atualizar preview de parceiros em tempo real
[
  "partnerIconSelect",
  "partnerColor",
  "partnerName",
  "partnerSubname",
  "partnerCategory",
  "partnerDescription",
  "partnerSubDescIcon",
  "partnerSubDesc",
  "partnerDestSymbol",
  "partnerDestLink"
].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener("input", updatePartnerPreview);
  el.addEventListener("change", updatePartnerPreview);
});

// Atualizar preview de gaming em tempo real
[
  "gamingIconSelect",
  "gamingGradientColor1",
  "gamingGradientColor2",
  "gamingTitle",
  "gamingSubtitle",
  "gamingTitle2",
  "gamingDescription",
  "minicardTitle",
  "minicardEvent1Title",
  "minicardEvent1Value",
  "minicardEvent1Sub",
  "minicardEvent1Color",
  "minicardEvent2Title",
  "minicardEvent2Value",
  "minicardEvent2Sub",
  "minicardEvent2Color",
  "gamingButtonText",
  "gamingButtonIcon",
  "gamingButtonLink",
  "gamingButtonColor",
  "gamingBottomText"
].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", updateGamingPreview);
    el.addEventListener("change", updateGamingPreview);
  }
});

// Atualizar preview de quiz em tempo real
function setupQuizRealTimePreview() {
  const fields = ["quizPhotoUrl", "quizName", "quizPrize", "quizLink"];
  
  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        updateQuizPreview();
      });
      el.addEventListener("change", () => {
        updateQuizPreview();
      });
    }
  });
}

// ===== CARREGAMENTO INICIAL DO DASHBOARD =====
async function initDashboard() {
  try {
    // Carregar todos os dados do Firebase
    await Promise.all([
      loadNews(),
      loadPartners(),
      loadGaming(),
      loadQuiz(),
      loadSiteLinks(),
      loadLivepix(),
      loadGeneralWinners()
    ]);

    // Pré-carregar formulário de ganhadores gerais
    if (els.gwCategory) { await loadGeneralWinnerIntoForm(els.gwCategory.value); }// Inicializar previews
    updatePreviewFromForm();
    updatePartnerPreview();
    updateGamingPreview();
    setupQuizRealTimePreview();
    updateQuizPreview();
    
    // Mostrar dashboard por padrão
    showSection('dashboard');
    
    console.log("Dashboard inicializado com Firebase!");
    showToast('success', 'Sistema carregado', 'Dados sincronizados com Firebase.');
  } catch (error) {
    console.error("Erro ao inicializar dashboard:", error);
    showToast('error', 'Erro de conexão', 'Não foi possível conectar ao Firebase.');
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initGoatcounterUI();

  // Bind foto mode toggles
  window.__newsImage = bindImageMode({
    base64RadioId: "newsImageModeBase64",
    linkRadioId: "newsImageModeLink",
    base64WrapId: "newsImageBase64Wrap",
    linkWrapId: "newsImageLinkWrap",
    fileInputId: "newsImageFile",
    hiddenBase64Id: "newsImageBase64",
    infoId: "newsImageInfo",
    linkInputId: "imageUrl"
  });

  window.__quizPhoto = bindImageMode({
    base64RadioId: "quizPhotoModeBase64",
    linkRadioId: "quizPhotoModeLink",
    base64WrapId: "quizPhotoBase64Wrap",
    linkWrapId: "quizPhotoLinkWrap",
    fileInputId: "quizPhotoFile",
    hiddenBase64Id: "quizPhotoBase64",
    infoId: "quizPhotoInfo",
    linkInputId: "quizPhotoUrl"
  });


  // Atualizar previews quando trocar foto/modo
  ["newsImageModeBase64","newsImageModeLink","newsImageFile","imageUrl"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => { try { updatePreviewFromForm(); } catch {} });
    el.addEventListener("input", () => { try { updatePreviewFromForm(); } catch {} });
  });

  ["quizPhotoModeBase64","quizPhotoModeLink","quizPhotoFile","quizPhotoUrl"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => { try { updateQuizPreview(); } catch {} });
    el.addEventListener("input", () => { try { updateQuizPreview(); } catch {} });
  });

  window.__gwPhoto = bindImageMode({
    base64RadioId: "gwPhotoModeBase64",
    linkRadioId: "gwPhotoModeLink",
    base64WrapId: "gwPhotoBase64Wrap",
    linkWrapId: "gwPhotoLinkWrap",
    fileInputId: "gwPhotoFile",
    hiddenBase64Id: "gwPhotoBase64",
    infoId: "gwPhotoInfo",
    linkInputId: "gwImageUrl"
  });
});
