/**
 * Saung H. Amir - POS Kasir, Tagihan Meja & Rekap Terpadu
 * File: js/kasir.js
 */

import { menuData, POS_CATEGORIES, getMenuPosCategory, migrateMenusToFirestore } from './data.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  updateDoc,
  doc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  getDoc,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

// Konfigurasi Resmi Firebase Saung H. Amir
const firebaseConfig = {
  apiKey: "AIzaSyC41kOQ68sy1zLQKvE2bVRjTFwEw6JLVVY",
  authDomain: "saung-h-amir.firebaseapp.com",
  projectId: "saung-h-amir",
  storageBucket: "saung-h-amir.firebasestorage.app",
  messagingSenderId: "183459251916",
  appId: "1:183459251916:web:825d1700d325aacc052469",
  measurementId: "G-ZED8VN1HR9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Format Mata Uang Rupiah
const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});

function formatRupiah(amount) {
  return currencyFormatter.format(amount || 0);
}

function formatDate(dateObj) {
  if (!dateObj) return '-';
  const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimeOnly(dateObj) {
  if (!dateObj) return '-';
  const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} WIB`;
}

// State Aplikasi POS
const state = {
  isAuth: false,
  activeTab: 'pane-tagihan',
  activeCategory: 'ALL',
  searchKeyword: '',
  isOjol: false,
  cart: [],
  firestoreMenus: [...menuData],
  isMenusLoaded: false,
  // Rekap Date Filter State
  rekapFilter: {
    preset: 'today',
    startDate: '',
    endDate: ''
  },
  allLunasOrders: []
};

// Elemen DOM
const dom = {
  pinOverlay: document.getElementById('pin-overlay'),
  pinInput: document.getElementById('pin-input'),
  pinForm: document.getElementById('pin-form'),
  pinError: document.getElementById('pin-error'),
  pinSubmitBtn: document.getElementById('pin-submit-btn'),

  // RestoQu Bottom Navigation Bar & Panes
  bottomNav: document.getElementById('bottom-nav'),
  bottomBtnHome: document.getElementById('bottom-btn-home'),
  bottomBtnKasir: document.getElementById('bottom-btn-kasir'),
  bottomBtnAdd: document.getElementById('bottom-btn-add'),
  btnCloseInputPane: document.getElementById('btn-close-input-pane'),
  paneHome: document.getElementById('pane-home'),
  paneTagihan: document.getElementById('pane-tagihan'),
  paneInput: document.getElementById('pane-input'),

  // Floating Checkout Bar RestoQu
  floatingCheckoutBar: document.getElementById('floating-checkout-bar'),
  floatingCheckoutSummary: document.getElementById('floating-checkout-summary'),
  btnFloatingCheckout: document.getElementById('btn-floating-checkout'),

  // Tabs Nav Legacy
  tabBtnInput: document.getElementById('tab-btn-input'),
  tabBtnTagihan: document.getElementById('tab-btn-tagihan'),
  badgeUnpaidTables: document.getElementById('badge-unpaid-tables'),
  badgeRekapTotal: document.getElementById('badge-rekap-total'),

  // Tombol & Modal Rekap Pemasukan (Kompatibilitas)
  btnOpenRekapModal: document.getElementById('btn-open-rekap-modal') || document.getElementById('btn-open-rekap'),
  rekapModal: document.getElementById('rekap-modal') || document.getElementById('modal-rekap'),
  btnCloseRekapModal: document.getElementById('btn-close-rekap-modal') || document.getElementById('btn-close-rekap'),

  // Banner Peringatan Raksasa & Alarm Sirine
  newOrderAlarmOverlay: document.getElementById('new-order-alarm-overlay'),
  btnStopAlarm: document.getElementById('btn-stop-alarm'),

  // Tab 1: Input Pesanan
  btnSelectCategory: document.getElementById('btn-select-category'),
  btnCategoryLabel: document.getElementById('btn-category-label'),
  modalCategoryPicker: document.getElementById('modal-category-picker'),
  btnCloseCategoryPicker: document.getElementById('btn-close-category-picker'),
  btnCancelCategoryPicker: document.getElementById('btn-cancel-category-picker'),
  categoryPickerList: document.getElementById('category-picker-list'),
  searchInput: document.getElementById('pos-search'),
  searchClearBtn: document.getElementById('pos-search-clear'),
  categoriesContainer: document.getElementById('pos-categories'),
  menuGrid: document.getElementById('pos-menu-grid'),
  ojolBanner: document.getElementById('pos-ojol-banner'),
  ojolMenuCount: document.getElementById('pos-ojol-menu-count'),
  ojolToggle: document.getElementById('pos-ojol-toggle'),
  ojolCodeGroup: document.getElementById('pos-ojol-code-group'),
  ojolCodeInput: document.getElementById('pos-ojol-code'),
  tableSelect: document.getElementById('pos-table-select'),
  cartItemsContainer: document.getElementById('pos-cart-items'),
  cartCountBadge: document.getElementById('pos-cart-count-badge'),
  cartTotal: document.getElementById('pos-cart-total'),
  clearCartBtn: document.getElementById('pos-clear-cart-btn'),
  sendOrderBtn: document.getElementById('pos-send-order-btn'),
  sendBtnText: document.getElementById('pos-send-btn-text'),

  // Modal Tambah Menu Baru Kasir
  btnOpenCustomMenu: document.getElementById('btn-open-custom-menu'),
  customMenuModal: document.getElementById('custom-menu-modal'),
  btnCloseCustomMenuModal: document.getElementById('btn-close-custom-menu-modal'),
  customMenuForm: document.getElementById('custom-menu-form'),
  customMenuName: document.getElementById('custom-menu-name'),
  customMenuCategory: document.getElementById('custom-menu-category'),
  customMenuPrice: document.getElementById('custom-menu-price'),
  customMenuGofoodPrice: document.getElementById('custom-menu-gofood-price'),
  customMenuCount: document.getElementById('custom-menu-count'),
  customMenuListItems: document.getElementById('custom-menu-list-items'),

  // Tab 2: Tagihan Kasir
  cashierBillsContainer: document.getElementById('cashier-bills-container'),

  // Modal Edit Pesanan (Meja Belum Lunas)
  modalEditPesanan: document.getElementById('modal-edit-pesanan') || document.getElementById('edit-order-modal'),
  editOrderModal: document.getElementById('modal-edit-pesanan') || document.getElementById('edit-order-modal'),
  editOrderModalTitle: document.getElementById('edit-order-modal-title'),
  editOrderModalSub: document.getElementById('edit-order-modal-sub'),
  btnCloseEditOrderModal: document.getElementById('btn-close-edit-order-modal'),
  btnCancelEditOrder: document.getElementById('btn-cancel-edit-order'),
  btnSaveEditOrder: document.getElementById('btn-save-edit-order'),
  editOrderItemsContainer: document.getElementById('edit-order-items-container'),
  editOrderTotalItems: document.getElementById('edit-order-total-items'),
  editOrderNewTotal: document.getElementById('edit-order-new-total'),

  // Modal Sukses Pembayaran & Cetak Struk Pasca-Bayar
  modalSuksesBayar: document.getElementById('modal-sukses-bayar'),
  suksesTransaksiInfo: document.getElementById('sukses-transaksi-info'),
  suksesMejaLabel: document.getElementById('sukses-meja-label'),
  suksesMetodeBadge: document.getElementById('sukses-metode-badge'),
  suksesTotalLabel: document.getElementById('sukses-total-label'),
  suksesCashChangeRow: document.getElementById('sukses-cash-change-row'),
  suksesChangeLabel: document.getElementById('sukses-change-label'),
  btnSuksesCetakStruk: document.getElementById('btn-sukses-cetak-struk'),
  btnSuksesSelesai: document.getElementById('btn-sukses-selesai'),

  // Modal Pembayaran Tunai
  cashModal: document.getElementById('cash-modal'),
  cashModalTitle: document.getElementById('cash-modal-title'),
  cashModalTotal: document.getElementById('cash-modal-total'),
  cashReceivedInput: document.getElementById('cash-received-input'),
  btnQuickExact: document.getElementById('btn-quick-exact'),
  cashChangeBox: document.getElementById('cash-change-box'),
  cashChangeLabel: document.getElementById('cash-change-label'),
  cashModalChange: document.getElementById('cash-modal-change'),
  closeCashModal: document.getElementById('close-cash-modal'),
  cancelCashBtn: document.getElementById('cancel-cash-btn'),
  confirmCashBtn: document.getElementById('confirm-cash-btn'),

  // Modal Rekap: Filter & KPIs
  rekapStartDate: document.getElementById('rekap-start-date'),
  rekapEndDate: document.getElementById('rekap-end-date'),
  btnApplyFilter: document.getElementById('btn-apply-filter'),
  kpiTunai: document.getElementById('kpi-tunai'),
  kpiTunaiCount: document.getElementById('kpi-tunai-count'),
  kpiQris: document.getElementById('kpi-qris'),
  kpiQrisCount: document.getElementById('kpi-qris-count'),
  kpiDebit: document.getElementById('kpi-debit'),
  kpiDebitCount: document.getElementById('kpi-debit-count'),
  kpiGrandTotal: document.getElementById('kpi-grand-total'),
  kpiTotalTransaksi: document.getElementById('kpi-total-transaksi'),
  rekapTableTitle: document.getElementById('rekap-table-title'),
  rekapRangeLabel: document.getElementById('rekap-range-label'),
  rekapCardsContainer: document.getElementById('rekap-cards-container'),
  btnDownloadCsv: document.getElementById('btn-download-csv'),

  // Modal Batalkan / Hapus Transaksi Rekap
  modalBatalTransaksi: document.getElementById('modal-batal-transaksi'),
  btnCloseModalBatal: document.getElementById('btn-close-modal-batal'),
  btnCancelBatalDialog: document.getElementById('btn-cancel-batal-dialog'),
  btnConfirmBatalOrder: document.getElementById('btn-confirm-batal-order'),
  btnConfirmBatalText: document.getElementById('btn-confirm-batal-text'),
  modalBatalTitle: document.getElementById('modal-batal-title'),
  modalBatalSub: document.getElementById('modal-batal-sub'),
  batalTargetMeja: document.getElementById('batal-target-meja'),
  batalTargetWaktu: document.getElementById('batal-target-waktu'),
  batalTargetMetode: document.getElementById('batal-target-metode'),
  batalTargetTotal: document.getElementById('batal-target-total'),
  batalTargetItems: document.getElementById('batal-target-items'),
  batalReasonInput: document.getElementById('batal-reason-input'),

  // Thermal Print & Toast
  printArea: document.getElementById('thermal-print-area'),
  toast: document.getElementById('pos-toast')
};

/* --------------------------------------------------------------------------
   1. Autentikasi PIN & Password Kasir POS
   -------------------------------------------------------------------------- */
const VALID_PASSWORDS = ['Salzabill4', '262012'];

function checkAuth() {
  const sessionAuth = sessionStorage.getItem('saha_pos_auth');
  if (sessionAuth === 'true') {
    state.isAuth = true;
    if (dom.pinOverlay) dom.pinOverlay.style.display = 'none';
  } else {
    state.isAuth = false;
    if (dom.pinOverlay) {
      dom.pinOverlay.style.display = 'flex';
      if (dom.pinInput) {
        dom.pinInput.value = '';
        dom.pinInput.focus();
      }
    }
  }
}

function handlePinSubmit(e) {
  if (e) e.preventDefault();
  const enteredPin = (dom.pinInput.value || '').trim();
  if (VALID_PASSWORDS.includes(enteredPin)) {
    sessionStorage.setItem('saha_pos_auth', 'true');
    state.isAuth = true;
    dom.pinError.textContent = '';
    dom.pinOverlay.style.display = 'none';
    showToast('Akses kasir POS berhasil dibuka.', 'success');
  } else {
    dom.pinError.textContent = 'Password / PIN salah. Silakan coba lagi.';
    dom.pinInput.value = '';
    dom.pinInput.focus();
  }
}

function lockPOS() {
  sessionStorage.removeItem('saha_pos_auth');
  state.isAuth = false;
  if (dom.pinOverlay) {
    dom.pinOverlay.style.display = 'flex';
    dom.pinError.textContent = '';
    dom.pinInput.value = '';
    dom.pinInput.focus();
  }
  showToast('Layar POS berhasil dikunci.', '');
}

function startClock() {
  function update() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    if (dom.liveClock) {
      dom.liveClock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} WIB`;
    }
  }
  update();
  setInterval(update, 1000);
}

let toastTimer = null;
function showToast(message, type = '') {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.className = 'pos-toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 3500);
}

/* --------------------------------------------------------------------------
   2. Navigasi Bottom Nav RestoQu (Home, Kasir, Input Menu)
   -------------------------------------------------------------------------- */
function switchTab(tabId) {
  state.activeTab = tabId;

  // 1. Update active state pada tombol Bottom Nav dan tombol legacy
  const allNavBtns = [
    dom.bottomBtnHome,
    dom.bottomBtnKasir,
    dom.bottomBtnAdd,
    dom.tabBtnInput,
    dom.tabBtnTagihan,
    ...document.querySelectorAll('#bottom-nav [data-tab]')
  ];
  allNavBtns.forEach((btn) => {
    if (btn) {
      const isActive = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  });

  // 2. Update status display ketiga Pane Utama (Home, Kasir, Input)
  const panes = [
    { el: dom.paneHome || document.getElementById('pane-home'), id: 'pane-home' },
    { el: dom.paneTagihan || document.getElementById('pane-tagihan'), id: 'pane-tagihan' },
    { el: dom.paneInput || document.getElementById('pane-input'), id: 'pane-input' }
  ];

  panes.forEach(({ el, id }) => {
    if (el) {
      const isActive = id === tabId;
      el.classList.toggle('active', isActive);
      if (isActive) {
        el.style.setProperty('display', 'flex', 'important');
      } else {
        el.style.setProperty('display', 'none', 'important');
      }
    }
  });

  // 3. Atur visibilitas Floating Checkout Bar RestoQu
  const floatingBar = dom.floatingCheckoutBar || document.getElementById('floating-checkout-bar');
  if (floatingBar) {
    if (tabId === 'pane-input' && state.cart && state.cart.length > 0) {
      floatingBar.style.setProperty('display', 'flex', 'important');
    } else {
      floatingBar.style.setProperty('display', 'none', 'important');
    }
  }

  // 4. Scroll ke atas secara halus
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openRekapModal() {
  switchTab('pane-home');
}

function closeRekapModal() {
  switchTab('pane-tagihan');
}

// Window helper aliases agar bisa diakses secara global jika dibutuhkan
window.openRekapModal = openRekapModal;
window.closeRekapModal = closeRekapModal;
window.bukaModalRekap = openRekapModal;
window.tutupModalRekap = closeRekapModal;
window.showRekap = openRekapModal;
window.hideRekap = closeRekapModal;
window.switchTab = switchTab;

/* --------------------------------------------------------------------------
   3. TAB 1: INPUT PESANAN (RESTOQU 1:1 COMPACT FLAT LIST & STRIP KATEGORI)
   -------------------------------------------------------------------------- */
const RESTOQU_CATEGORIES = [
  { id: 'ALL', label: 'SEMUA' },
  { id: 'Nasi', label: 'A NASI' },
  { id: 'Sayur', label: 'B SAYUR' },
  { id: 'Daging', label: 'C DAGING' },
  { id: 'Ayam', label: 'D AYAM' },
  { id: 'Gurame', label: 'E GURAME' },
  { id: 'Lauk', label: 'F LAUK' },
  { id: 'Pepes', label: 'G PEPES' },
  { id: 'Ikan Asin', label: 'H IKAN ASIN' },
  { id: 'Sambal', label: 'I SAMBAL' },
  { id: 'Jengkol Pete', label: 'J JENGKOL PETE' },
  { id: 'Minuman', label: 'K MINUMAN' },
  { id: 'Paket Berlima', label: 'L PAKET BERLIMA' },
  { id: 'Ongkir', label: 'M ONGKIR' }
];

function matchesRestoQuCategory(item, catId) {
  if (!catId || catId === 'ALL') return true;
  const rawCat = String(item.category || item.posCategory || item.customCategory || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();

  switch (catId) {
    case 'Nasi':
      return rawCat.includes('nasi') || name.includes('nasi') || name.includes('liwet') || name.includes('bakul');
    case 'Sayur':
      return rawCat.includes('sayur') || rawCat.includes('kuah') || rawCat.includes('tumis') ||
             name.includes('sayur') || name.includes('kangkung') || name.includes('taoge') ||
             name.includes('sop') || name.includes('asem') || name.includes('lalap');
    case 'Daging':
      return rawCat.includes('daging') || name.includes('daging') || name.includes('gepuk') ||
             name.includes('iga') || name.includes('buntut') || name.includes('sapi');
    case 'Ayam':
      return rawCat.includes('ayam') || rawCat.includes('bebek') || name.includes('ayam') || name.includes('bebek');
    case 'Gurame':
      return rawCat.includes('gurame') || name.includes('gurame');
    case 'Lauk':
      return rawCat.includes('lauk') || rawCat.includes('gorengan') || rawCat.includes('seafood') ||
             name.includes('tahu') || name.includes('tempe') || name.includes('mendoan') ||
             name.includes('bakwan') || name.includes('telur') || name.includes('nila') ||
             name.includes('udang') || name.includes('cumi');
    case 'Pepes':
      return rawCat.includes('pepes') || name.includes('pepes');
    case 'Ikan Asin':
      return rawCat.includes('asin') || name.includes('asin') || name.includes('jambal') || name.includes('peda');
    case 'Sambal':
      return rawCat.includes('sambal') || name.includes('sambal');
    case 'Jengkol Pete':
      return name.includes('jengkol') || name.includes('pete') || name.includes('petai');
    case 'Minuman':
      return rawCat.includes('minum') || rawCat.includes('jus') || name.startsWith('es ') ||
             name.includes('es ') || name.includes('jus') || name.includes('teh') ||
             name.includes('kopi') || name.includes('jeruk') || name.includes('kelapa') ||
             name.includes('mineral') || name.includes('aqua') || name.includes('soda');
    case 'Paket Berlima':
      return rawCat.includes('paket') || rawCat.includes('berlima') || name.includes('paket') || name.includes('berlima');
    case 'Ongkir':
      return name.includes('ongkir') || name.includes('gosend') || name.includes('grab') ||
             name.includes('box') || Boolean(item.isCustom);
    default:
      return true;
  }
}

/* --------------------------------------------------------------------------
   Data Menu Dinamis & Realtime dari Koleksi Firestore "menus"
   -------------------------------------------------------------------------- */
let isMenusMigrationTriggered = false;

function getCatalog() {
  const list = (state.firestoreMenus && state.firestoreMenus.length > 0)
    ? state.firestoreMenus
    : menuData;
  // Urutkan A - Z secara permanen
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));
}

function setupRealtimeMenusListener() {
  const menusCol = collection(db, 'menus');
  onSnapshot(menusCol, async (snapshot) => {
    if (snapshot.empty) {
      console.log('[Kasir] Koleksi "menus" di Firestore belum ada/kosong.');
      if (!isMenusMigrationTriggered) {
        isMenusMigrationTriggered = true;
        console.log('[Kasir] Memulai migrasi otomatis menu awal ke Firestore...');
        await migrateMenusToFirestore(db);
      }
      return;
    }

    const firestoreList = [];
    snapshot.forEach((docSnap) => {
      firestoreList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Urutkan A - Z secara permanen
    firestoreList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));

    state.firestoreMenus = firestoreList;
    state.isMenusLoaded = true;

    renderMenuGrid();
    renderCustomMenuList();

    if (dom.ojolMenuCount) {
      dom.ojolMenuCount.textContent = state.isOjol
        ? `${firestoreList.length} Menu (Harga GoFood)`
        : `${firestoreList.length} Menu`;
    }
  }, (err) => {
    console.warn('[Kasir] Gagal membaca koleksi menus dari Firestore:', err);
  });
}

function openCategoryPickerModal() {
  const modal = dom.modalCategoryPicker || document.getElementById('modal-category-picker');
  if (!modal) return;
  renderCategoryPickerList();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeCategoryPickerModal() {
  const modal = dom.modalCategoryPicker || document.getElementById('modal-category-picker');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function renderCategoryPickerList() {
  const listEl = dom.categoryPickerList || document.getElementById('category-picker-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const currentCat = state.activeCategory || 'ALL';

  RESTOQU_CATEGORIES.forEach((cat) => {
    const isSelected = currentCat === cat.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-category-option ${isSelected ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="cat-option-name">${cat.label}</span>
      ${isSelected ? '<span class="cat-option-check">✓ Dipilih</span>' : '<span class="cat-option-arrow">➔</span>'}
    `;

    btn.addEventListener('click', () => {
      selectCategory(cat.id, cat.label);
    });

    listEl.appendChild(btn);
  });
}

function selectCategory(catId, catLabel) {
  state.activeCategory = catId;
  updateCategoryButtonLabel(catId, catLabel);
  closeCategoryPickerModal();
  renderMenuGrid();
}

function updateCategoryButtonLabel(catId, catLabel) {
  const labelEl = dom.btnCategoryLabel || document.getElementById('btn-category-label');
  if (!labelEl) return;
  if (!catId || catId === 'ALL') {
    labelEl.textContent = 'PILIH KATEGORI MENU ⬇️';
  } else {
    labelEl.textContent = `KATEGORI: ${catLabel || catId} ⬇️`;
  }
}

function renderCategories() {
  const activeObj = RESTOQU_CATEGORIES.find((c) => c.id === (state.activeCategory || 'ALL'));
  updateCategoryButtonLabel(state.activeCategory || 'ALL', activeObj ? activeObj.label : '');
  if (dom.categoriesContainer) {
    dom.categoriesContainer.innerHTML = '';
  }
}

function renderMenuGrid() {
  if (!dom.menuGrid) return;
  const catalog = getCatalog();
  const keyword = state.searchKeyword.toLowerCase().trim();

  let filtered = catalog;

  // 1. Filter Kategori RestoQu
  if (state.activeCategory && state.activeCategory !== 'ALL') {
    filtered = filtered.filter((item) => matchesRestoQuCategory(item, state.activeCategory));
  }

  // 2. Filter Pencarian Cepat
  if (keyword) {
    filtered = filtered.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const cat = (item.category || item.posCategory || '').toLowerCase();
      return name.includes(keyword) || cat.includes(keyword);
    });
  }

  // 3. WAJIB URUT SECARA ALFABETIS A - Z
  filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));

  if (dom.ojolMenuCount) {
    dom.ojolMenuCount.textContent = state.isOjol
      ? `${filtered.length} Menu (Harga GoFood)`
      : `${filtered.length} Menu`;
  }

  dom.menuGrid.innerHTML = '';

  if (filtered.length === 0) {
    dom.menuGrid.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: #94a3b8; background: #ffffff; width: 100%;">
        <span style="font-size: 2.2rem; display: block; margin-bottom: 0.5rem;">🔍</span>
        <p style="font-weight: 700; font-size: 1.1rem; color: #64748b;">Menu tidak ditemukan</p>
      </div>
    `;
    return;
  }

  // RENDER RESTOQU 1:1 COMPACT FLAT LIST (KOMPAK & RAMPING)
  filtered.forEach((item) => {
    const itemPrice = state.isOjol ? (item.goFoodPrice || Math.round(item.price * 1.2)) : item.price;
    const isCustom = Boolean(item.isCustom);
    const cartItem = state.cart.find((c) => String(c.id) === String(item.id));
    const cartQty = cartItem ? cartItem.qty : 0;

    const row = document.createElement('div');
    row.className = `restoqu-menu-row menu-item-row ${cartQty > 0 ? 'in-cart' : ''}`;
    row.setAttribute('data-id', item.id);

    row.innerHTML = `
      <div class="restoqu-menu-info">
        <div class="restoqu-menu-name">
          ${item.name}
          ${isCustom ? '<span class="restoqu-badge-custom">[Kasir]</span>' : ''}
        </div>
        <div class="restoqu-menu-price">${formatRupiah(itemPrice)}</div>
      </div>
      <div class="restoqu-menu-action">
        ${cartQty === 0
          ? `<button type="button" class="btn-restoqu-add" title="Tambah ${item.name} ke keranjang">+ Tambah</button>`
          : `<div class="restoqu-qty-control">
               <button type="button" class="btn-restoqu-qty btn-minus" title="Kurangi 1">−</button>
               <span class="restoqu-qty-num">${cartQty}</span>
               <button type="button" class="btn-restoqu-qty btn-plus" title="Tambah 1">+</button>
             </div>`
        }
      </div>
    `;

    // Pasang Event Listeners
    const btnAdd = row.querySelector('.btn-restoqu-add');
    if (btnAdd) {
      btnAdd.addEventListener('click', (e) => {
        e.stopPropagation();
        addItemToCart(item);
      });
    }

    const btnMinus = row.querySelector('.btn-minus');
    if (btnMinus) {
      btnMinus.addEventListener('click', (e) => {
        e.stopPropagation();
        updateCartItemQtyById(item.id, -1);
      });
    }

    const btnPlus = row.querySelector('.btn-plus');
    if (btnPlus) {
      btnPlus.addEventListener('click', (e) => {
        e.stopPropagation();
        updateCartItemQtyById(item.id, 1);
      });
    }

    dom.menuGrid.appendChild(row);
  });
}

function updateMenuRowsCartQty() {
  if (!dom.menuGrid) return;
  const rows = dom.menuGrid.querySelectorAll('.restoqu-menu-row[data-id]');
  rows.forEach((row) => {
    const itemId = row.getAttribute('data-id');
    const cartItem = state.cart.find((c) => String(c.id) === String(itemId));
    const cartQty = cartItem ? cartItem.qty : 0;
    const actionEl = row.querySelector('.restoqu-menu-action');
    if (!actionEl) return;

    row.classList.toggle('in-cart', cartQty > 0);

    if (cartQty === 0) {
      actionEl.innerHTML = `<button type="button" class="btn-restoqu-add" title="Tambah ke keranjang">+ Tambah</button>`;
      const btnAdd = actionEl.querySelector('.btn-restoqu-add');
      if (btnAdd) {
        btnAdd.addEventListener('click', (e) => {
          e.stopPropagation();
          const catalog = getCatalog();
          const it = catalog.find((i) => String(i.id) === String(itemId));
          if (it) addItemToCart(it);
        });
      }
    } else {
      actionEl.innerHTML = `
        <div class="restoqu-qty-control">
          <button type="button" class="btn-restoqu-qty btn-minus" title="Kurangi 1">−</button>
          <span class="restoqu-qty-num">${cartQty}</span>
          <button type="button" class="btn-restoqu-qty btn-plus" title="Tambah 1">+</button>
        </div>
      `;
      const btnMinus = actionEl.querySelector('.btn-minus');
      if (btnMinus) {
        btnMinus.addEventListener('click', (e) => {
          e.stopPropagation();
          updateCartItemQtyById(itemId, -1);
        });
      }
      const btnPlus = actionEl.querySelector('.btn-plus');
      if (btnPlus) {
        btnPlus.addEventListener('click', (e) => {
          e.stopPropagation();
          updateCartItemQtyById(itemId, 1);
        });
      }
    }
  });
}

function updateCartItemQtyById(itemId, delta) {
  const index = state.cart.findIndex((c) => String(c.id) === String(itemId));
  if (index > -1) {
    updateCartItemQty(index, delta);
  } else if (delta > 0) {
    const catalog = getCatalog();
    const menuItem = catalog.find((i) => String(i.id) === String(itemId));
    if (menuItem) {
      addItemToCart(menuItem);
    }
  }
}

function addItemToCart(menuItem) {
  const currentPrice = state.isOjol ? (menuItem.goFoodPrice || Math.round(menuItem.price * 1.2)) : menuItem.price;
  const existingIndex = state.cart.findIndex((item) => item.id === menuItem.id);

  if (existingIndex > -1) {
    state.cart[existingIndex].qty += 1;
    state.cart[existingIndex].subtotal = state.cart[existingIndex].qty * state.cart[existingIndex].price;
  } else {
    state.cart.push({
      id: menuItem.id,
      name: menuItem.name,
      price: currentPrice,
      qty: 1,
      subtotal: currentPrice,
      note: '',
      isCustom: Boolean(menuItem.isCustom)
    });
  }

  renderCart();
  showToast(`${menuItem.name} ditambahkan ke keranjang`, '');
}

function updateCartItemQty(index, delta) {
  if (!state.cart[index]) return;
  const nextQty = state.cart[index].qty + delta;
  if (nextQty <= 0) {
    state.cart.splice(index, 1);
  } else {
    state.cart[index].qty = Math.min(99, nextQty);
  }
  renderCart();
}

function removeCartItem(index) {
  if (!state.cart[index]) return;
  state.cart.splice(index, 1);
  renderCart();
}

function updateCartItemNote(index, noteText) {
  if (state.cart[index]) {
    state.cart[index].note = noteText;
  }
}

function clearCart() {
  if (state.cart.length === 0) return;
  if (confirm('Kosongkan keranjang pesanan saat ini?')) {
    state.cart = [];
    renderCart();
  }
}

function syncCartPricesWithMode() {
  const catalog = getCatalog();
  const catalogMap = new Map(catalog.map((i) => [i.id, i]));

  state.cart.forEach((cartItem) => {
    const product = catalogMap.get(cartItem.id);
    if (product) {
      cartItem.price = state.isOjol ? (product.goFoodPrice || Math.round(product.price * 1.2)) : product.price;
      cartItem.subtotal = cartItem.qty * cartItem.price;
    }
  });

  renderCart();
}

function handleFloatingCheckoutClick() {
  // Arahkan tampilan langsung ke Panel Keranjang & Checkout
  const cartPanel = document.querySelector('.pos-cart-panel');
  if (cartPanel) {
    cartPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (dom.tableSelect) {
    dom.tableSelect.focus();
  }
}

function renderCart() {
  if (!dom.cartItemsContainer) return;

  const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);
  const totalHarga = state.cart.reduce((sum, item) => sum + (item.qty * item.price), 0);

  if (dom.cartCountBadge) dom.cartCountBadge.textContent = `${totalItems} Item`;
  if (dom.cartTotal) dom.cartTotal.textContent = formatRupiah(totalHarga);

  // Update Floating Checkout Bar RestoQu
  const floatingBar = dom.floatingCheckoutBar || document.getElementById('floating-checkout-bar');
  const floatingText = dom.floatingCheckoutSummary || document.getElementById('floating-checkout-summary');

  if (floatingBar) {
    if (state.cart.length > 0 && state.activeTab === 'pane-input') {
      floatingBar.style.setProperty('display', 'flex', 'important');
      if (floatingText) {
        floatingText.textContent = `${totalItems} item | ${formatRupiah(totalHarga)}`;
      }
    } else {
      floatingBar.style.setProperty('display', 'none', 'important');
    }
  }

  // Update sinkronisasi tombol Tambah / Qty stepper pada baris-baris menu
  updateMenuRowsCartQty();

  if (state.cart.length === 0) {
    dom.cartItemsContainer.innerHTML = `
      <div class="pos-cart-empty">
        <span class="pos-cart-empty-icon">🍽️</span>
        <p style="font-weight: 700; color: #475569;">Belum ada menu dipilih</p>
        <small>Klik tombol menu di sebelah kiri untuk menambah pesanan</small>
      </div>
    `;
    return;
  }

  dom.cartItemsContainer.innerHTML = '';

  state.cart.forEach((item, index) => {
    const subtotal = item.qty * item.price;
    const itemEl = document.createElement('div');
    itemEl.className = 'pos-cart-item';

    itemEl.innerHTML = `
      <div class="pos-cart-item-header">
        <span class="pos-cart-item-name">${item.name}</span>
        <span class="pos-cart-item-price">${formatRupiah(item.price)}</span>
        <button type="button" class="pos-cart-item-delete" title="Hapus menu">✕</button>
      </div>
      <div class="pos-cart-item-actions">
        <div class="pos-qty-stepper">
          <button type="button" class="pos-qty-btn btn-minus">−</button>
          <span class="pos-qty-val">${item.qty}</span>
          <button type="button" class="pos-qty-btn btn-plus">+</button>
        </div>
        <span class="pos-item-subtotal">${formatRupiah(subtotal)}</span>
      </div>
      <input 
        type="text" 
        class="pos-item-note-input" 
        placeholder="Tambah catatan (contoh: pedas, less sugar)..." 
        value="${item.note || ''}"
      >
    `;

    itemEl.querySelector('.pos-cart-item-delete').addEventListener('click', () => removeCartItem(index));
    itemEl.querySelector('.btn-minus').addEventListener('click', () => updateCartItemQty(index, -1));
    itemEl.querySelector('.btn-plus').addEventListener('click', () => updateCartItemQty(index, 1));
    itemEl.querySelector('.pos-item-note-input').addEventListener('input', (e) => updateCartItemNote(index, e.target.value));

    dom.cartItemsContainer.appendChild(itemEl);
  });
}

function handleOjolToggle(e) {
  state.isOjol = e.target.checked;
  if (state.isOjol) {
    if (dom.ojolBanner) dom.ojolBanner.style.display = 'flex';
    if (dom.ojolCodeGroup) dom.ojolCodeGroup.style.display = 'flex';
    if (dom.ojolCodeInput) dom.ojolCodeInput.focus();
    if (dom.tableSelect) dom.tableSelect.value = 'Take-Away';
  } else {
    if (dom.ojolBanner) dom.ojolBanner.style.display = 'none';
    if (dom.ojolCodeGroup) dom.ojolCodeGroup.style.display = 'none';
  }
  syncCartPricesWithMode();
  renderMenuGrid();
}

async function checkIsAddonOrder(nomorMeja) {
  if (!nomorMeja || nomorMeja === 'Take-Away') return false;
  try {
    const q = query(
      collection(db, 'orders'),
      where('nomorMeja', '==', nomorMeja),
      where('paymentStatus', '==', 'belum_lunas')
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.warn('Gagal periksa addon meja:', err);
    return false;
  }
}

async function sendOrderToFirestore() {
  if (state.cart.length === 0) {
    alert('Keranjang pesanan masih kosong. Pilih minimal 1 menu sebelum mengirim.');
    return;
  }

  const nomorMeja = (dom.tableSelect.value || 'Meja 1').trim();
  const isTakeAway = nomorMeja === 'Take-Away' || state.isOjol;
  const orderType = isTakeAway ? 'take_away' : 'dine_in';

  let kodeOjol = '';
  if (state.isOjol) {
    kodeOjol = (dom.ojolCodeInput.value || '').trim();
    if (!kodeOjol) {
      alert('Mode Ojol aktif! Wajib mengisi "Kode Referensi / Kode Gojek" (contoh: GF-1234 atau 4 digit).');
      if (dom.ojolCodeInput) dom.ojolCodeInput.focus();
      return;
    }
  }

  dom.sendOrderBtn.disabled = true;
  dom.sendBtnText.textContent = 'Mengirim ke Dapur...';

  try {
    let isAddon = false;
    if (!isTakeAway) {
      isAddon = await checkIsAddonOrder(nomorMeja);
    }

    const formattedItems = state.cart.map((item) => ({
      id: String(item.id),
      name: String(item.name),
      qty: Number(item.qty),
      price: Number(item.price),
      subtotal: Number(item.qty * item.price),
      note: String(item.note || '').trim()
    }));

    const totalHarga = formattedItems.reduce((acc, it) => acc + it.subtotal, 0);

    const payload = {
      nomorMeja: nomorMeja,
      orderType: orderType,
      isOjol: Boolean(state.isOjol),
      kodeOjol: state.isOjol ? kodeOjol : '',
      isAddon: Boolean(isAddon),
      items: formattedItems,
      totalHarga: Number(totalHarga),
      kitchenStatus: 'baru',
      paymentStatus: 'belum_lunas',
      paymentMethod: '',
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'orders'), payload);
    if (docRef && docRef.id) {
      selfCreatedOrderIds.add(docRef.id);
      knownNewOrderIds.add(docRef.id);
    }

    const successMsg = state.isOjol
      ? `Pesanan GoFood/Grab (${kodeOjol}) berhasil dikirim ke Dapur!`
      : `Pesanan ${nomorMeja} berhasil dikirim ke Dapur! ${isAddon ? '(Pesanan Tambahan)' : ''}`;

    showToast(successMsg, 'success');
    state.cart = [];
    renderCart();
    if (dom.ojolCodeInput) dom.ojolCodeInput.value = '';

    // Beralih otomatis ke tab Kasir (Tagihan Meja) agar kasir langsung melihat bon meja baru
    switchTab('pane-tagihan');

  } catch (err) {
    console.error('Gagal mengirim pesanan ke Firestore:', err);
    alert('Gagal mengirim pesanan: ' + (err.message || 'Kesalahan jaringan.'));
    showToast('Gagal mengirim pesanan ke dapur.', 'error');
  } finally {
    dom.sendOrderBtn.disabled = false;
    dom.sendBtnText.textContent = 'Kirim Pesanan ke Dapur';
  }
}

/* --------------------------------------------------------------------------
   4. TAB 2: TAGIHAN & PEMBAYARAN KASIR (PENGGABUNGAN BON MEJA)
   -------------------------------------------------------------------------- */
let activeCashModalGroup = null;

function getOrderTimestamp(order) {
  const ts = order.createdAt || order.timestamp;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime() || 0;
}

function setupCashierBillsListener() {
  const q = query(
    collection(db, 'orders'),
    where('paymentStatus', '==', 'belum_lunas')
  );

  onSnapshot(q, (snapshot) => {
    const orders = [];
    snapshot.forEach((docSnap) => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });

    // PENGGABUNGAN MEJA OTOMATIS
    const tableGroups = {};
    orders.forEach((order) => {
      const isReservasiUnassigned = (order.isReservasi || order.tipePesanan === 'Reservasi' || order.serviceType === 'reservasi' || order.orderType === 'reservasi') &&
        (!order.nomorMeja || order.nomorMeja === 'Reservasi Saung' || String(order.nomorMeja).toLowerCase().includes('reservasi'));

      const isTakeAwayOrder = (order.nomorMeja === 'Take-Away' || order.nomorMeja === 'Take-Away (Bungkus)' || order.orderType === 'take_away' || order.serviceType === 'take-away' || order.tipePesanan === 'Take-Away') && !order.isOjol;

      const groupKey = order.isOjol
        ? `Ojol-${order.kodeOjol || order.kodeReferensi || order.id}`
        : isReservasiUnassigned
          ? `Reservasi-${order.id}`
          : isTakeAwayOrder
            ? `TakeAway-${order.id}`
            : (order.nomorMeja || `Order-${order.id}`);

      if (!tableGroups[groupKey]) {
        tableGroups[groupKey] = {
          groupKey: groupKey,
          nomorMeja: order.nomorMeja || (isReservasiUnassigned ? 'Reservasi Saung' : (isTakeAwayOrder ? 'Take-Away' : 'Meja')),
          isOjol: Boolean(order.isOjol),
          kodeOjol: order.kodeOjol || order.kodeReferensi || '',
          tickets: [],
          totalHarga: 0,
          earliestTimestamp: Infinity
        };
      }

      tableGroups[groupKey].tickets.push(order);
      tableGroups[groupKey].totalHarga += Number(order.totalHarga || 0);

      const oTime = getOrderTimestamp(order);
      if (oTime && oTime < tableGroups[groupKey].earliestTimestamp) {
        tableGroups[groupKey].earliestTimestamp = oTime;
      }
    });

    const groupsArray = Object.values(tableGroups);

    // Pastikan earliestTimestamp valid
    groupsArray.forEach((grp) => {
      if (grp.earliestTimestamp === Infinity) {
        grp.earliestTimestamp = Date.now();
      }
    });

    // Urutkan kartu meja berdasarkan timestamp waktu masuk (FIFO: tiket pertama masuk di posisi paling atas)
    groupsArray.sort((a, b) => (a.earliestTimestamp || 0) - (b.earliestTimestamp || 0));

    // Update Badge Tagihan
    if (dom.badgeUnpaidTables) {
      dom.badgeUnpaidTables.textContent = `${groupsArray.length} Meja`;
      dom.badgeUnpaidTables.classList.toggle('badge-alert', groupsArray.length > 0);
    }

    renderCashierBills(groupsArray);
  }, (err) => {
    console.error('Error onSnapshot tagihan kasir:', err);
  });
}

function renderCashierBills(groups) {
  if (!dom.cashierBillsContainer) return;

  if (groups.length === 0) {
    dom.cashierBillsContainer.innerHTML = `
      <div class="pos-cart-empty" style="grid-column: 1/-1; padding: 4rem 1rem;">
        <span class="pos-cart-empty-icon">💳</span>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: #334155;">Semua Tagihan Sudah Lunas</h3>
        <p style="color: #64748b;">Tidak ada tagihan meja yang berstatus belum lunas saat ini.</p>
      </div>
    `;
    return;
  }

  dom.cashierBillsContainer.innerHTML = '';

  groups.forEach((group) => {
    const card = document.createElement('article');

    const ticketCount = group.tickets.length;
    const isMultiple = ticketCount > 1;

    // Kumpulkan informasi pelanggan dari tiket-tiket dalam grup
    const custName = group.tickets.map(t => t.namaPemesan || t.customerName).find(n => n && n !== '-' && n !== 'Pelanggan Meja') || group.tickets[0].namaPemesan || group.tickets[0].customerName || '';
    const grpName = group.tickets.map(t => t.namaRombongan || t.groupName).find(g => g && g !== '-') || group.tickets[0].namaRombongan || group.tickets[0].groupName || '';
    const phone = group.tickets.map(t => t.nomorWhatsapp || t.phone).find(p => p && p !== '-') || group.tickets[0].nomorWhatsapp || group.tickets[0].phone || '';
    const notes = group.tickets.map(t => t.catatanKhusus || t.notes).filter(n => n && n !== '-').join('; ') || group.tickets[0].catatanKhusus || group.tickets[0].notes || '';
    const guestCount = group.tickets.map(t => t.jumlahOrang || t.guestCount).find(g => g && g !== '-') || group.tickets[0].jumlahOrang || group.tickets[0].guestCount || '';
    const jamKedatangan = group.tickets.map(t => t.jamKedatangan || t.reservationTime).find(j => j && j !== '-') || group.tickets[0].jamKedatangan || group.tickets[0].reservationTime || '';
    const tglKedatangan = group.tickets.map(t => t.tanggalKedatangan || t.reservationDate).find(d => d && d !== '-') || group.tickets[0].tanggalKedatangan || group.tickets[0].reservationDate || '';

    const isReservasi = group.tickets.some((t) => 
      t.tipePesanan === 'Reservasi' || 
      t.serviceType === 'reservasi' || 
      t.orderType === 'reservasi' || 
      Boolean(t.isReservasi)
    );
    const isQr = group.tickets.some((t) => 
      t.tipePesanan === 'PESAN LEWAT QR MEJA' || 
      Boolean(t.isQrOrder)
    );
    const isTakeAway = group.tickets.some((t) => 
      t.orderType === 'take_away' || 
      t.serviceType === 'take-away' || 
      t.tipePesanan === 'Take-Away'
    );

    card.className = `bill-card ${isReservasi ? 'bill-card-reservasi' : ''} ${group.isOjol ? 'bill-card-ojol' : ''}`;

    const isReservasiUnassigned = isReservasi && (
      !group.nomorMeja || 
      group.nomorMeja === 'Reservasi Saung' || 
      String(group.nomorMeja).toLowerCase().includes('reservasi')
    );

    const displayTitle = group.isOjol
      ? `🛵 [GOFOOD - ${group.kodeOjol || 'Driver'}]`
      : isReservasiUnassigned
        ? '📅 Reservasi Saung (Belum Ada Meja)'
        : (group.nomorMeja || 'Tanpa Meja');

    const currentTableDisplay = isReservasiUnassigned
      ? ''
      : (group.nomorMeja || '');

    // Konsolidasikan daftar menu
    const mergedItems = [];
    group.tickets.forEach((ticket, tIdx) => {
      (ticket.items || []).forEach((item, itemIdx) => {
        mergedItems.push({
          ticketId: ticket.id,
          itemIdx: itemIdx,
          ticketNum: tIdx + 1,
          name: item.name || item.nama || 'Menu',
          qty: Number(item.qty || item.quantity || 1),
          price: Number(item.price || item.harga || 0),
          subtotal: Number(item.subtotal || ((item.qty || 1) * (item.price || 0))),
          note: item.note || item.catatan || ''
        });
      });
    });

    const itemsHtml = mergedItems.map((item) => `
      <div class="bill-item-row inline-edit" data-ticket-id="${item.ticketId}" data-item-idx="${item.itemIdx}">
        <div class="bill-item-main-info">
          <div class="bill-item-title-wrap">
            <strong class="bill-item-title">${item.name}</strong>
            ${item.note ? `<small class="bill-item-note">(${item.note})</small>` : ''}
            ${isMultiple ? `<span class="bill-item-ticket-badge">Tiket #${item.ticketNum}</span>` : ''}
          </div>
          <span class="bill-item-unit-price">${formatRupiah(item.price)}</span>
        </div>

        <div class="bill-item-stepper-wrap">
          <button type="button" class="btn-bill-stepper btn-bill-minus" data-ticket-id="${item.ticketId}" data-item-idx="${item.itemIdx}" title="Kurangi 1 porsi">－</button>
          <span class="bill-stepper-qty">${item.qty}</span>
          <button type="button" class="btn-bill-stepper btn-bill-plus" data-ticket-id="${item.ticketId}" data-item-idx="${item.itemIdx}" title="Tambah 1 porsi">＋</button>
        </div>

        <div class="bill-item-subtotal-wrap">
          <strong class="bill-item-amount">${formatRupiah(item.subtotal)}</strong>
        </div>
      </div>
    `).join('');

    card.innerHTML = `
      <header class="bill-card-header ${isReservasi ? 'header-reservasi' : ''}">
        <div class="bill-header-main-row">
          <div class="bill-table-info">
            <strong class="bill-table-name">${displayTitle}</strong>
            ${isReservasi ? `<span class="badge-reservasi-pill">📅 RESERVASI (${jamKedatangan ? `${jamKedatangan} WIB` : 'Waktu -'})</span>` : ''}
            ${isQr && !isReservasi ? `<span class="badge-qr-pill">📱 PESAN LEWAT QR MEJA</span>` : ''}
            ${isTakeAway && !group.isOjol ? `<span class="badge-takeaway-pill">🥡 TAKE-AWAY</span>` : ''}
            ${isMultiple ? `<span class="bill-tickets-merged-badge">📦 ${ticketCount} Tiket Tergabung</span>` : ''}
          </div>
          <div class="bill-total-header">${formatRupiah(group.totalHarga)}</div>
        </div>

        <div class="bill-header-meta-row">
          <span class="meta-item-time">⏱️ Masuk: <strong>${formatTimeOnly(group.earliestTimestamp)}</strong></span>
          ${jamKedatangan ? `<span class="meta-item-plan">🕒 Kedatangan: <strong>${jamKedatangan} WIB</strong></span>` : ''}
          ${guestCount && guestCount !== '-' ? `<span class="meta-item-guest">👥 <strong>${guestCount}</strong></span>` : ''}
          ${tglKedatangan ? `<span class="meta-item-date">📆 ${tglKedatangan}</span>` : ''}
        </div>
      </header>

      <!-- Panel Data Pelanggan & Edit In-Line (Nomor Meja, Nama, Rombongan, Catatan) -->
      <div class="bill-customer-info-section">
        <div class="customer-inline-field field-nomor-meja">
          <span class="inline-field-label">🪑 No. Meja:</span>
          <div class="inline-input-box">
            <input 
              type="text" 
              class="inline-editable-input input-meja" 
              data-field="tableNumber" 
              value="${escapeHtml(currentTableDisplay)}" 
              placeholder="${isReservasi ? 'Set Meja (contoh: Meja 4)...' : 'Set Nomor Meja (Meja 1-15)...'}" 
              title="Klik untuk langsung ganti nomor meja"
            >
          </div>
        </div>

        <div class="customer-inline-field">
          <span class="inline-field-label">👤 Pemesan:</span>
          <div class="inline-input-box">
            <input 
              type="text" 
              class="inline-editable-input input-customer-name" 
              data-field="customerName" 
              value="${escapeHtml(custName)}" 
              placeholder="Ketik nama pemesan..." 
              title="Klik untuk langsung edit nama pemesan"
            >
          </div>
        </div>

        <div class="customer-inline-field">
          <span class="inline-field-label">🏢 Rombongan:</span>
          <div class="inline-input-box">
            <input 
              type="text" 
              class="inline-editable-input input-group-name" 
              data-field="groupName" 
              value="${escapeHtml(grpName)}" 
              placeholder="Instansi / nama rombongan..." 
              title="Klik untuk langsung edit rombongan"
            >
          </div>
        </div>

        ${phone && phone !== '-' ? `
          <div class="customer-inline-field">
            <span class="inline-field-label">📱 WhatsApp:</span>
            <div class="inline-phone-display">
              <a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener noreferrer" class="link-wa-customer" title="Hubungi Pelanggan via WhatsApp">
                📞 ${phone}
              </a>
            </div>
          </div>
        ` : ''}

        <div class="customer-inline-field notes-field">
          <span class="inline-field-label">📝 Catatan:</span>
          <div class="inline-input-box">
            <input 
              type="text" 
              class="inline-editable-input input-customer-notes" 
              data-field="notes" 
              value="${escapeHtml(notes)}" 
              placeholder="Catatan khusus pelanggan..." 
              title="Klik untuk langsung edit catatan"
            >
          </div>
        </div>
      </div>

      <div class="bill-items-list">
        ${itemsHtml}
      </div>

      <footer class="bill-footer">
        <div class="bill-actions-row">
          <button type="button" class="btn-bill-print">
            <span>🖨️</span>
            <span>Cetak Struk Tagihan</span>
          </button>
        </div>

        <div class="bill-settle-group">
          <button type="button" class="btn-settle btn-settle-tunai" data-method="Tunai">
            💵 Lunas Tunai
          </button>
          <button type="button" class="btn-settle btn-settle-qris" data-method="QRIS">
            📱 Lunas QRIS
          </button>
          <button type="button" class="btn-settle btn-settle-debit" data-method="Debit">
            💳 Lunas Debit
          </button>
        </div>
      </footer>
    `;

    // Pasang Event Listener Inline Edit (onblur & Enter)
    card.querySelectorAll('.inline-editable-input').forEach((input) => {
      input.addEventListener('focus', () => {
        input.setAttribute('data-original-val', input.value.trim());
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });

      input.addEventListener('blur', async () => {
        const field = input.getAttribute('data-field');
        let newVal = input.value.trim();
        const origVal = input.getAttribute('data-original-val') || '';

        // Auto-format dan validasi nomor meja
        if (field === 'tableNumber') {
          if (!newVal) {
            if (isReservasi) {
              if (!origVal) return;
              newVal = 'Reservasi Saung';
            } else {
              input.value = origVal;
              showToast('Nomor meja tidak boleh kosong.', 'warning');
              return;
            }
          } else {
            // Jika kasir hanya ketik angka (misal "4" atau "04") -> format jadi "Meja 4"
            if (/^\d+$/.test(newVal)) {
              newVal = `Meja ${parseInt(newVal, 10)}`;
              input.value = newVal;
            } else if (/^meja\s*\d+$/i.test(newVal)) {
              const num = parseInt(newVal.replace(/\D/g, ''), 10);
              newVal = `Meja ${num}`;
              input.value = newVal;
            }
          }
        }

        if (newVal === origVal) return;

        await handleInlineUpdateCustomerField(group, field, newVal, input);
      });
    });

    // Event Stepper Minus & Plus Inline Langsung Update Firebase
    card.querySelectorAll('.btn-bill-minus').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ticketId = btn.getAttribute('data-ticket-id');
        const itemIdx = parseInt(btn.getAttribute('data-item-idx'), 10);
        await handleInlineUpdateItemQty(ticketId, itemIdx, -1, btn);
      });
    });

    card.querySelectorAll('.btn-bill-plus').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ticketId = btn.getAttribute('data-ticket-id');
        const itemIdx = parseInt(btn.getAttribute('data-item-idx'), 10);
        await handleInlineUpdateItemQty(ticketId, itemIdx, 1, btn);
      });
    });

    // Event Cetak Struk
    card.querySelector('.btn-bill-print').addEventListener('click', () => {
      printCustomerReceipt(group, mergedItems);
    });

    // Event Lunas Tunai (Buka Dialog Hitung Kembalian)
    card.querySelector('.btn-settle-tunai').addEventListener('click', () => {
      openCashPaymentModal(group, mergedItems);
    });

    // Event Lunas QRIS
    card.querySelector('.btn-settle-qris').addEventListener('click', async () => {
      if (confirm(`Konfirmasi pelunasan tagihan ${displayTitle} (${formatRupiah(group.totalHarga)}) via QRIS?`)) {
        await settleTableBill(group, 'QRIS', group.totalHarga, 0);
        showToast(`Pembayaran QRIS ${displayTitle} Berhasil!`, 'success');
        openPaymentSuccessModal(group, mergedItems, 'QRIS', group.totalHarga, 0);
      }
    });

    // Event Lunas Debit
    card.querySelector('.btn-settle-debit').addEventListener('click', async () => {
      if (confirm(`Konfirmasi pelunasan tagihan ${displayTitle} (${formatRupiah(group.totalHarga)}) via Debit?`)) {
        await settleTableBill(group, 'Debit', group.totalHarga, 0);
        showToast(`Pembayaran Debit ${displayTitle} Berhasil!`, 'success');
        openPaymentSuccessModal(group, mergedItems, 'Debit', group.totalHarga, 0);
      }
    });

    dom.cashierBillsContainer.appendChild(card);
  });
}

async function handleInlineUpdateCustomerField(group, field, newValue, inputEl) {
  if (!group || !group.tickets || group.tickets.length === 0) return;

  if (inputEl) {
    inputEl.classList.add('inline-updating');
  }

  try {
    for (const ticket of group.tickets) {
      const isReservasi = ticket.tipePesanan === 'Reservasi' || 
                          ticket.serviceType === 'reservasi' || 
                          ticket.orderType === 'reservasi' || 
                          Boolean(ticket.isReservasi);

      let finalValue = newValue;
      if (field === 'tableNumber') {
        if (!finalValue && isReservasi) {
          finalValue = 'Reservasi Saung';
        }
      }

      const updateData = {
        [field]: finalValue,
        updatedAt: serverTimestamp()
      };

      // Sinkronkan nama field padanan
      if (field === 'customerName') {
        updateData.namaPemesan = finalValue;
      } else if (field === 'groupName') {
        updateData.namaRombongan = finalValue;
      } else if (field === 'notes') {
        updateData.catatanKhusus = finalValue;
        updateData.customerNotes = finalValue;
      } else if (field === 'tableNumber') {
        updateData.nomorMeja = finalValue;
        updateData.tableNumber = finalValue;
      }

      await updateDoc(doc(db, 'orders', ticket.id), updateData);
    }

    if (field === 'tableNumber') {
      group.nomorMeja = newValue;
    }

    if (inputEl) {
      inputEl.setAttribute('data-original-val', newValue);
      inputEl.classList.remove('inline-updating');
      inputEl.classList.add('inline-update-success');
      setTimeout(() => inputEl.classList.remove('inline-update-success'), 1200);
    }

    const fieldLabel = field === 'tableNumber'
      ? 'Nomor Meja'
      : (field === 'customerName' 
          ? 'Nama Pemesan' 
          : (field === 'groupName' ? 'Nama Rombongan' : 'Catatan'));
    showToast(`${fieldLabel} berhasil diperbarui!`, 'success');
  } catch (err) {
    console.error('Gagal memperbarui data pelanggan:', err);
    if (inputEl) {
      inputEl.classList.remove('inline-updating');
      inputEl.classList.add('inline-update-error');
    }
    alert('Gagal menyimpan perubahan: ' + (err.message || 'Kesalahan jaringan.'));
  }
}

/* --------------------------------------------------------------------------
   4b. KONTROL JUMLAH INLINE (STEPPER LANGSUNG KE FIRESTORE TANPA MODAL)
   -------------------------------------------------------------------------- */
let isInlineUpdating = false;

async function handleInlineUpdateItemQty(ticketId, itemIdx, delta, triggerBtn) {
  if (isInlineUpdating) return;
  if (!ticketId || isNaN(itemIdx)) return;

  isInlineUpdating = true;
  if (triggerBtn) {
    triggerBtn.disabled = true;
  }

  try {
    const ticketRef = doc(db, 'orders', ticketId);
    const ticketSnap = await getDoc(ticketRef);
    if (!ticketSnap.exists()) {
      alert('Tiket pesanan tidak ditemukan di database.');
      return;
    }

    const data = ticketSnap.data();
    const items = Array.isArray(data.items) ? [...data.items] : [];
    if (!items[itemIdx]) {
      alert('Menu tidak ditemukan dalam daftar pesanan.');
      return;
    }

    const item = { ...items[itemIdx] };
    const currentQty = Number(item.qty || item.quantity || 1);
    const price = Number(item.price || item.harga || 0);
    const nextQty = currentQty + delta;

    if (nextQty <= 0) {
      const confirmDelete = confirm(`Hapus menu "${item.name || item.nama || 'ini'}" dari pesanan?`);
      if (!confirmDelete) return;

      // Hapus item dari array pesanan
      items.splice(itemIdx, 1);

      // Jika seluruh item tiket habis, hapus dokumen tiket dari Firestore
      if (items.length === 0) {
        await deleteDoc(ticketRef);
        showToast('Pesanan telah dihapus karena seluruh menu ditiadakan.', 'info');
        return;
      }
    } else {
      item.qty = Math.min(99, nextQty);
      item.subtotal = item.qty * price;
      items[itemIdx] = item;
    }

    // Hitung ulang totalHarga tiket
    const newTotal = items.reduce((sum, it) => {
      const p = Number(it.price || it.harga || 0);
      const q = Number(it.qty || it.quantity || 1);
      return sum + (p * q);
    }, 0);

    // Sanitasi items untuk Firestore
    const sanitizedItems = items.map((it) => ({
      id: String(it.id || ''),
      name: String(it.name || it.nama || 'Menu'),
      qty: Number(it.qty || it.quantity || 1),
      price: Number(it.price || it.harga || 0),
      subtotal: Number(it.price || it.harga || 0) * Number(it.qty || it.quantity || 1),
      note: String(it.note || it.catatan || '').trim()
    }));

    await updateDoc(ticketRef, {
      items: sanitizedItems,
      totalHarga: Number(newTotal),
      updatedAt: serverTimestamp()
    });

    showToast(nextQty <= 0 ? 'Menu dihapus dari pesanan' : `Jumlah menu diubah (${nextQty})`, 'success');
  } catch (err) {
    console.error('Gagal memperbarui pesanan secara inline:', err);
    alert('Gagal mengupdate pesanan: ' + (err.message || 'Kesalahan koneksi.'));
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
    }
    isInlineUpdating = false;
  }
}

// Fungsi stub aman untuk menjaga kompatibilitas jika ada pemanggilan lama
function openEditOrderModal() {}
function closeEditOrderModal() {}
function handleSaveOrderEdits() {}

/* --------------------------------------------------------------------------
   5. MODAL PEMBAYARAN TUNAI (HITUNG KEMBALIAN REAL-TIME)
   -------------------------------------------------------------------------- */
function openCashPaymentModal(group, mergedItems) {
  activeCashModalGroup = { group, mergedItems };
  const displayTitle = group.isOjol ? `GoFood (${group.kodeOjol})` : group.nomorMeja;

  dom.cashModalTitle.textContent = `💵 Pembayaran Tunai - ${displayTitle}`;
  dom.cashModalTotal.textContent = formatRupiah(group.totalHarga);
  dom.cashReceivedInput.value = '';
  dom.cashModalChange.textContent = 'Rp 0';
  dom.cashModalChange.className = 'change-amount';
  dom.cashChangeBox.className = 'cash-modal-change-box';
  dom.confirmCashBtn.disabled = true;

  dom.cashModal.style.display = 'flex';
  dom.cashReceivedInput.focus();
}

function closeCashModalHandler() {
  dom.cashModal.style.display = 'none';
  activeCashModalGroup = null;
}

function handleCashInput() {
  if (!activeCashModalGroup) return;
  const total = activeCashModalGroup.group.totalHarga;
  const received = Number(dom.cashReceivedInput.value) || 0;
  const change = received - total;

  if (received === 0) {
    dom.cashModalChange.textContent = 'Rp 0';
    dom.cashModalChange.className = 'change-amount';
    dom.cashChangeBox.className = 'cash-modal-change-box';
    dom.confirmCashBtn.disabled = true;
    return;
  }

  if (change >= 0) {
    dom.cashChangeLabel.textContent = 'Kembalian:';
    dom.cashModalChange.textContent = formatRupiah(change);
    dom.cashModalChange.className = 'change-amount';
    dom.cashChangeBox.className = 'cash-modal-change-box';
    dom.confirmCashBtn.disabled = false;
  } else {
    dom.cashChangeLabel.textContent = 'Kurang:';
    dom.cashModalChange.textContent = formatRupiah(Math.abs(change));
    dom.cashModalChange.className = 'change-amount insufficient';
    dom.cashChangeBox.className = 'cash-modal-change-box is-insufficient';
    dom.confirmCashBtn.disabled = true;
  }
}

async function processCashPayment() {
  if (!activeCashModalGroup) return;
  const { group, mergedItems } = activeCashModalGroup;
  const total = group.totalHarga;
  const received = Number(dom.cashReceivedInput.value) || 0;
  const change = Math.max(0, received - total);

  if (received < total) {
    alert('Uang yang diterima kurang dari total tagihan!');
    return;
  }

  dom.confirmCashBtn.disabled = true;
  dom.confirmCashBtn.textContent = 'Memproses...';

  try {
    await settleTableBill(group, 'Tunai', received, change);
    closeCashModalHandler();
    showToast(`✅ Pembayaran Tunai ${group.nomorMeja} Lunas! Kembalian: ${formatRupiah(change)}`, 'success');

    // Buka Modal Sukses & Opsi Cetak Struk Pasca-Bayar
    openPaymentSuccessModal(group, mergedItems, 'Tunai', received, change);

  } catch (err) {
    console.error('Gagal memproses pembayaran tunai:', err);
    alert('Gagal memproses pembayaran: ' + (err.message || 'Kesalahan jaringan.'));
  } finally {
    dom.confirmCashBtn.textContent = '✅ Proses Pembayaran (Lunas)';
  }
}

async function settleTableBill(group, paymentMethod, cashReceived = 0, changeAmount = 0) {
  const batch = writeBatch(db);

  group.tickets.forEach((ticket) => {
    const ticketRef = doc(db, 'orders', ticket.id);
    const updatePayload = {
      paymentStatus: 'lunas',
      paymentMethod: paymentMethod,
      paidAt: serverTimestamp()
    };
    if (paymentMethod === 'Tunai') {
      updatePayload.cashReceived = cashReceived;
      updatePayload.changeAmount = changeAmount;
    }
    batch.update(ticketRef, updatePayload);
  });

  await batch.commit();
}

/* --------------------------------------------------------------------------
   5b. MODAL SUKSES PEMBAYARAN & CETAK STRUK PASCA-BAYAR
   -------------------------------------------------------------------------- */
let activePaymentSuccessData = null;

function openPaymentSuccessModal(group, mergedItems, paymentMethod, cashReceived = null, changeAmount = null) {
  if (!dom.modalSuksesBayar) return;
  activePaymentSuccessData = { group, mergedItems, paymentMethod, cashReceived, changeAmount };

  const displayTitle = group.isOjol
    ? `GoFood (${group.kodeOjol || group.kodeReferensi || 'Driver'})`
    : (group.nomorMeja || 'Take-Away');

  if (dom.suksesMejaLabel) {
    dom.suksesMejaLabel.textContent = displayTitle;
  }
  if (dom.suksesMetodeBadge) {
    dom.suksesMetodeBadge.textContent = paymentMethod;
    dom.suksesMetodeBadge.className = `badge-method ${paymentMethod}`;
  }
  if (dom.suksesTotalLabel) {
    dom.suksesTotalLabel.textContent = formatRupiah(group.totalHarga);
  }

  if (paymentMethod === 'Tunai' && cashReceived !== null) {
    if (dom.suksesCashChangeRow) dom.suksesCashChangeRow.style.display = 'flex';
    if (dom.suksesChangeLabel) dom.suksesChangeLabel.textContent = formatRupiah(changeAmount || 0);
  } else {
    if (dom.suksesCashChangeRow) dom.suksesCashChangeRow.style.display = 'none';
  }

  dom.modalSuksesBayar.style.display = 'flex';
}

function closePaymentSuccessModal() {
  if (dom.modalSuksesBayar) {
    dom.modalSuksesBayar.style.display = 'none';
  }
  activePaymentSuccessData = null;
}

/* --------------------------------------------------------------------------
   6. TAB 3: REKAP PEMASUKAN DENGAN RENTANG WAKTU (HARIAN / MINGGUAN)
   -------------------------------------------------------------------------- */
function isOrderCancelled(o) {
  if (!o) return false;
  return (
    o.paymentStatus === 'dibatalkan' ||
    o.status === 'dibatalkan' ||
    Boolean(o.isCancelled) ||
    o.paymentStatus === 'batal' ||
    o.status === 'batal'
  );
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupDailyRecapListener() {
  const q = query(
    collection(db, 'orders'),
    where('paymentStatus', 'in', ['lunas', 'dibatalkan'])
  );

  onSnapshot(q, (snapshot) => {
    const allLunas = [];
    snapshot.forEach((docSnap) => {
      allLunas.push({ id: docSnap.id, ...docSnap.data() });
    });

    state.allLunasOrders = allLunas;
    applyRekapFilter();
  }, (err) => {
    console.error('Error onSnapshot rekap pemasukan kasir:', err);
  });
}

function setPresetDates(preset) {
  state.rekapFilter.preset = preset;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const formatDateVal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    state.rekapFilter.startDate = formatDateVal(now);
    state.rekapFilter.endDate = formatDateVal(now);
  } else if (preset === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    state.rekapFilter.startDate = formatDateVal(yest);
    state.rekapFilter.endDate = formatDateVal(yest);
  } else if (preset === 'week') {
    // 7 hari terakhir
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    state.rekapFilter.startDate = formatDateVal(weekAgo);
    state.rekapFilter.endDate = formatDateVal(now);
  } else if (preset === 'month') {
    // Bulan ini (dari tanggal 1)
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    state.rekapFilter.startDate = formatDateVal(firstDay);
    state.rekapFilter.endDate = formatDateVal(now);
  } else if (preset === 'all') {
    state.rekapFilter.startDate = '';
    state.rekapFilter.endDate = '';
  }

  if (dom.rekapStartDate) dom.rekapStartDate.value = state.rekapFilter.startDate;
  if (dom.rekapEndDate) dom.rekapEndDate.value = state.rekapFilter.endDate;

  // Update preset buttons styling
  document.querySelectorAll('.btn-preset').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-preset') === preset);
  });

  applyRekapFilter();
}

function applyRekapFilter() {
  const allOrders = state.allLunasOrders || [];
  const startStr = (dom.rekapStartDate && dom.rekapStartDate.value) || state.rekapFilter.startDate;
  const endStr = (dom.rekapEndDate && dom.rekapEndDate.value) || state.rekapFilter.endDate;

  let filtered = allOrders;

  if (startStr && endStr) {
    const startMs = new Date(startStr + 'T00:00:00').getTime();
    const endMs = new Date(endStr + 'T23:59:59').getTime();

    filtered = allOrders.filter((o) => {
      const orderDate = o.paidAt ? (o.paidAt.toDate ? o.paidAt.toDate() : new Date(o.paidAt)) : (o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt)) : null);
      if (!orderDate) return false;
      const t = orderDate.getTime();
      return t >= startMs && t <= endMs;
    });

    if (dom.rekapRangeLabel) {
      dom.rekapRangeLabel.textContent = `Rentang: ${startStr} s/d ${endStr} (${filtered.length} transaksi)`;
    }
  } else {
    if (dom.rekapRangeLabel) {
      dom.rekapRangeLabel.textContent = `Menampilkan seluruh riwayat (${filtered.length} transaksi)`;
    }
  }

  // Urutkan transaksi terbaru di atas
  filtered.sort((a, b) => {
    const tA = a.paidAt ? (a.paidAt.toMillis ? a.paidAt.toMillis() : new Date(a.paidAt).getTime()) : (a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0);
    const tB = b.paidAt ? (b.paidAt.toMillis ? b.paidAt.toMillis() : new Date(b.paidAt).getTime()) : (b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0);
    return tB - tA;
  });

  calculateAndRenderRekap(filtered, startStr, endStr);
}

function calculateAndRenderRekap(orders, startStr, endStr) {
  let totalTunai = 0, countTunai = 0;
  let totalQris = 0, countQris = 0;
  let totalDebit = 0, countDebit = 0;
  let grandTotal = 0;
  let countLunas = 0;
  let countBatal = 0;
  let totalBatal = 0;

  orders.forEach((o) => {
    const isBatal = isOrderCancelled(o);
    const amount = Number(o.totalHarga || 0);
    const method = String(o.paymentMethod || 'Tunai');

    if (isBatal) {
      countBatal += 1;
      totalBatal += amount;
      // Transaksi dibatalkan: JANGAN masukkan ke perhitungan omzet
      return;
    }

    // Transaksi lunas aktif: masukkan ke omzet
    grandTotal += amount;
    countLunas += 1;

    if (method.toLowerCase().includes('qris')) {
      totalQris += amount;
      countQris += 1;
    } else if (method.toLowerCase().includes('debit')) {
      totalDebit += amount;
      countDebit += 1;
    } else {
      totalTunai += amount;
      countTunai += 1;
    }
  });

  if (dom.kpiTunai) dom.kpiTunai.textContent = formatRupiah(totalTunai);
  if (dom.kpiTunaiCount) dom.kpiTunaiCount.textContent = `${countTunai} transaksi`;

  if (dom.kpiQris) dom.kpiQris.textContent = formatRupiah(totalQris);
  if (dom.kpiQrisCount) dom.kpiQrisCount.textContent = `${countQris} transaksi`;

  if (dom.kpiDebit) dom.kpiDebit.textContent = formatRupiah(totalDebit);
  if (dom.kpiDebitCount) dom.kpiDebitCount.textContent = `${countDebit} transaksi`;

  if (dom.kpiGrandTotal) dom.kpiGrandTotal.textContent = formatRupiah(grandTotal);
  if (dom.kpiTotalTransaksi) {
    if (countBatal > 0) {
      dom.kpiTotalTransaksi.textContent = `${countLunas} transaksi lunas (${countBatal} dibatalkan)`;
    } else {
      dom.kpiTotalTransaksi.textContent = `Total ${countLunas} transaksi selesai`;
    }
  }

  if (dom.badgeRekapTotal) dom.badgeRekapTotal.textContent = formatRupiah(grandTotal);

  // Render Riwayat Transaksi Card View (Daftar Kartu Bertumpuk ala M-Banking)
  const container = dom.rekapCardsContainer || dom.rekapTableBody;
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="rekap-empty-state">
        <span class="rekap-empty-icon">🧾</span>
        <p>Tidak ada riwayat transaksi pada rentang tanggal yang dipilih.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map((o, idx) => {
    const isBatal = isOrderCancelled(o);
    const waktu = formatDate(o.paidAt || o.createdAt);
    const isOjol = Boolean(o.isOjol);
    const mejaText = isOjol
      ? `🛵 GoFood (${o.kodeOjol || o.kodeReferensi || 'Driver'})`
      : (o.nomorMeja || 'Take-Away');

    const itemsSummary = (o.items || [])
      .map((i) => `${i.qty || 1}x ${i.name || i.nama || 'Menu'}${i.note ? ` [${i.note}]` : ''}`)
      .join('; ');

    const method = o.paymentMethod || 'Tunai';

    return `
      <div class="rekap-tx-card ${isBatal ? 'is-cancelled' : ''}" data-id="${o.id}">
        <div class="rekap-card-top">
          <div class="rekap-card-datetime">
            <span class="rekap-card-date">📅 ${waktu}</span>
            <span class="rekap-card-time">Transaksi #${idx + 1}</span>
          </div>
          <div class="rekap-card-meta">
            <span class="rekap-card-table ${isOjol ? 'is-ojol' : ''}">${mejaText}</span>
            <span class="rekap-card-method-badge ${method}">💳 ${method}</span>
            ${isBatal ? `<span class="rekap-badge-batal">❌ DIBATALKAN</span>` : ''}
          </div>
        </div>

        ${isBatal ? `
          <div class="rekap-card-batal-info">
            <div class="batal-info-header">
              <span aria-hidden="true">⚠️</span>
              <strong>Pesanan Dibatalkan</strong>
            </div>
            <div class="batal-info-reason">
              <span class="batal-reason-label">Alasan:</span>
              <span class="batal-reason-text">"${escapeHtml(o.alasanBatal || 'Pesanan dibatalkan oleh kasir')}"</span>
            </div>
            <div class="batal-info-meta">
              🕒 Dibatalkan: ${formatDate(o.batalAt || o.updatedAt || o.paidAt)} ${o.batalBy ? `oleh ${escapeHtml(o.batalBy)}` : ''}
            </div>
          </div>
        ` : ''}

        <div class="rekap-card-body">
          <div class="rekap-card-menu-label ${isBatal ? 'text-red' : ''}">
            ${isBatal ? 'Daftar Menu (Batal):' : 'Pesanan:'}
          </div>
          <div class="rekap-card-items-list ${isBatal ? 'is-cancelled' : ''}">${itemsSummary}</div>
        </div>

        <div class="rekap-card-bottom">
          <div class="rekap-total-wrap">
            <span class="rekap-card-total-label">${isBatal ? 'Total Tagihan (Batal):' : 'Total Tagihan:'}</span>
            ${isBatal
              ? `<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                   <s class="rekap-card-total-value is-cancelled">${formatRupiah(o.totalHarga)}</s>
                   <span class="rekap-card-omzet-tag is-cancelled">❌ Tidak Masuk Omzet</span>
                 </div>`
              : `<strong class="rekap-card-total-value">${formatRupiah(o.totalHarga)}</strong>`
            }
          </div>
          <div class="rekap-card-actions">
            ${isBatal
              ? `<button type="button" class="btn-rekap-reprint" data-idx="${idx}" title="Cetak struk dengan keterangan DIBATALKAN">
                   <span>🖨️</span>
                   <span>Struk (Batal)</span>
                 </button>
                 <button type="button" class="btn-rekap-edit-reason" data-idx="${idx}" title="Ubah alasan pembatalan transaksi ini">
                   <span>✏️</span>
                   <span>Ubah Alasan</span>
                 </button>
                 <button type="button" class="btn-rekap-restore" data-idx="${idx}" title="Pulihkan transaksi ini kembali ke Lunas">
                   <span>↩️</span>
                   <span>Pulihkan</span>
                 </button>`
              : `<button type="button" class="btn-rekap-reprint" data-idx="${idx}" title="Cetak ulang struk pembayaran transaksi ini">
                   <span>🖨️</span>
                   <span>Cetak Ulang Struk</span>
                 </button>
                 <button type="button" class="btn-rekap-cancel-order" data-idx="${idx}" title="Batalkan pesanan ini dan kurangi omzet">
                   <span>❌</span>
                   <span>Batalkan Pesanan</span>
                 </button>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Pasang event listeners pada tombol di setiap kartu transaksi
  container.querySelectorAll('.btn-rekap-reprint').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const o = orders[idx];
      if (!o) return;

      const isBatal = isOrderCancelled(o);
      const group = {
        nomorMeja: o.nomorMeja || 'Take-Away',
        isOjol: Boolean(o.isOjol),
        kodeOjol: o.kodeOjol || o.kodeReferensi || '',
        totalHarga: Number(o.totalHarga) || 0,
        isCancelled: isBatal,
        alasanBatal: o.alasanBatal || ''
      };

      const mergedItems = (o.items || []).map((it) => ({
        name: it.name || it.nama || 'Menu',
        qty: Number(it.qty) || 1,
        price: Number(it.price) || 0,
        subtotal: Number(it.subtotal || ((it.qty || 1) * (it.price || 0))),
        note: it.note || ''
      }));

      printCustomerReceipt(group, mergedItems, o.cashReceived || null, o.changeAmount || null, isBatal, o.alasanBatal || '');
    });
  });

  // Tombol Batalkan Pesanan (Buka Modal Input Alasan)
  container.querySelectorAll('.btn-rekap-cancel-order').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const o = orders[idx];
      if (o) openBatalOrderModal(o, false);
    });
  });

  // Tombol Ubah Alasan
  container.querySelectorAll('.btn-rekap-edit-reason').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const o = orders[idx];
      if (o) openBatalOrderModal(o, true);
    });
  });

  // Tombol Pulihkan Transaksi (Restore back to Lunas)
  container.querySelectorAll('.btn-rekap-restore').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const o = orders[idx];
      if (o) handleRestoreOrder(o);
    });
  });
}

/* --------------------------------------------------------------------------
   6b. KONTROLER MODAL BATALKAN PESANAN REKAP / RESTORE TRANSAKSI
   -------------------------------------------------------------------------- */
let activeBatalOrder = null;
let isEditingBatalReasonOnly = false;

function openBatalOrderModal(order, isEditReason = false) {
  if (!order) return;
  activeBatalOrder = order;
  isEditingBatalReasonOnly = Boolean(isEditReason);

  const displayTitle = order.isOjol
    ? `🛵 GoFood (${order.kodeOjol || order.kodeReferensi || 'Driver'})`
    : (order.nomorMeja || 'Take-Away');

  if (dom.batalTargetMeja) dom.batalTargetMeja.textContent = displayTitle;
  if (dom.batalTargetWaktu) dom.batalTargetWaktu.textContent = formatDate(order.paidAt || order.createdAt);
  if (dom.batalTargetMetode) {
    dom.batalTargetMetode.textContent = order.paymentMethod || 'Tunai';
    dom.batalTargetMetode.className = `batal-summary-val badge-method ${order.paymentMethod || 'Tunai'}`;
  }
  if (dom.batalTargetTotal) {
    dom.batalTargetTotal.textContent = formatRupiah(order.totalHarga);
  }

  if (dom.batalTargetItems) {
    const itemsText = (order.items || [])
      .map((it) => `• ${it.qty || 1}x ${it.name || it.nama || 'Menu'}${it.note ? ` (${it.note})` : ''} - ${formatRupiah((it.qty || 1) * (it.price || 0))}`)
      .join('<br>');
    dom.batalTargetItems.innerHTML = itemsText || '<em>Tidak ada rincian menu</em>';
  }

  if (dom.batalReasonInput) {
    dom.batalReasonInput.value = order.alasanBatal || '';
  }

  if (isEditReason) {
    if (dom.modalBatalTitle) dom.modalBatalTitle.textContent = '✏️ Ubah Alasan Pembatalan';
    if (dom.modalBatalSub) dom.modalBatalSub.textContent = `Perbarui keterangan alasan pembatalan untuk ${displayTitle}`;
    if (dom.btnConfirmBatalText) dom.btnConfirmBatalText.textContent = 'Simpan Perubahan Alasan';
  } else {
    if (dom.modalBatalTitle) dom.modalBatalTitle.textContent = '❌ Batalkan Transaksi';
    if (dom.modalBatalSub) dom.modalBatalSub.textContent = `Pesanan akan ditandai dibatalkan dan otomatis mengurangi omzet`;
    if (dom.btnConfirmBatalText) dom.btnConfirmBatalText.textContent = 'Konfirmasi Batalkan Pesanan';
  }

  if (dom.modalBatalTransaksi) {
    dom.modalBatalTransaksi.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  setTimeout(() => {
    if (dom.batalReasonInput) dom.batalReasonInput.focus();
  }, 100);
}

function closeBatalOrderModal() {
  if (dom.modalBatalTransaksi) {
    dom.modalBatalTransaksi.style.display = 'none';
    document.body.style.overflow = '';
  }
  activeBatalOrder = null;
  isEditingBatalReasonOnly = false;
}

async function handleConfirmBatalOrder() {
  if (!activeBatalOrder) return;
  const reason = (dom.batalReasonInput ? dom.batalReasonInput.value : '').trim();

  if (!reason) {
    alert('Harap ketikkan alasan mengapa pesanan ini dibatalkan!');
    if (dom.batalReasonInput) dom.batalReasonInput.focus();
    return;
  }

  const order = activeBatalOrder;
  const mejaText = order.isOjol
    ? `GoFood (${order.kodeOjol || 'Driver'})`
    : (order.nomorMeja || 'Take-Away');

  if (isEditingBatalReasonOnly) {
    try {
      if (dom.btnConfirmBatalOrder) dom.btnConfirmBatalOrder.disabled = true;
      await updateDoc(doc(db, 'orders', order.id), {
        alasanBatal: reason,
        alasanUpdatedAt: serverTimestamp()
      });
      showToast('Alasan pembatalan pesanan berhasil diperbarui.', 'success');
      closeBatalOrderModal();
    } catch (err) {
      console.error('Gagal memperbarui alasan pembatalan:', err);
      alert('Gagal menyimpan perubahan alasan: ' + (err.message || 'Kesalahan jaringan'));
    } finally {
      if (dom.btnConfirmBatalOrder) dom.btnConfirmBatalOrder.disabled = false;
    }
    return;
  }

  const confirmMsg = `Yakin ingin membatalkan pesanan ${mejaText} senilai ${formatRupiah(order.totalHarga)}?\n\n` +
    `Alasan Pembatalan:\n"${reason}"\n\n` +
    `Perhatian: Nominal ${formatRupiah(order.totalHarga)} otomatis MENGURANGI total omzet rekap, namun data pesanan tetap tersimpan dengan tanda MERAH (DIBATALKAN).`;

  if (!confirm(confirmMsg)) return;

  try {
    if (dom.btnConfirmBatalOrder) {
      dom.btnConfirmBatalOrder.disabled = true;
      if (dom.btnConfirmBatalText) dom.btnConfirmBatalText.textContent = 'Membatalkan...';
    }

    await updateDoc(doc(db, 'orders', order.id), {
      paymentStatus: 'dibatalkan',
      status: 'dibatalkan',
      isCancelled: true,
      alasanBatal: reason,
      batalAt: serverTimestamp(),
      batalBy: 'Kasir',
      updatedAt: serverTimestamp()
    });

    showToast(`Pesanan ${mejaText} berhasil dibatalkan dan omzet telah berkurang.`, 'error');
    closeBatalOrderModal();
  } catch (err) {
    console.error('Gagal membatalkan pesanan di Firestore:', err);
    alert('Gagal membatalkan pesanan: ' + (err.message || 'Kesalahan jaringan'));
  } finally {
    if (dom.btnConfirmBatalOrder) {
      dom.btnConfirmBatalOrder.disabled = false;
      if (dom.btnConfirmBatalText) dom.btnConfirmBatalText.textContent = 'Konfirmasi Batalkan Pesanan';
    }
  }
}

async function handleRestoreOrder(order) {
  if (!order) return;
  const mejaText = order.isOjol
    ? `GoFood (${order.kodeOjol || 'Driver'})`
    : (order.nomorMeja || 'Take-Away');

  const confirmMsg = `Pulihkan transaksi ${mejaText} senilai ${formatRupiah(order.totalHarga)} kembali menjadi LUNAS?\n\n` +
    `Nominal ini akan kembali ditambahkan ke perhitungan omzet penjualan.`;

  if (!confirm(confirmMsg)) return;

  try {
    await updateDoc(doc(db, 'orders', order.id), {
      paymentStatus: 'lunas',
      status: 'lunas',
      isCancelled: false,
      restoredAt: serverTimestamp(),
      restoredBy: 'Kasir',
      updatedAt: serverTimestamp()
    });

    showToast(`Transaksi ${mejaText} berhasil dipulihkan kembali ke status LUNAS!`, 'success');
  } catch (err) {
    console.error('Gagal memulihkan transaksi:', err);
    alert('Gagal memulihkan transaksi: ' + (err.message || 'Kesalahan jaringan'));
  }
}

function downloadFilteredCsv() {
  const allOrders = state.allLunasOrders || [];
  const startStr = (dom.rekapStartDate && dom.rekapStartDate.value) || state.rekapFilter.startDate;
  const endStr = (dom.rekapEndDate && dom.rekapEndDate.value) || state.rekapFilter.endDate;

  let filtered = allOrders;
  if (startStr && endStr) {
    const startMs = new Date(startStr + 'T00:00:00').getTime();
    const endMs = new Date(endStr + 'T23:59:59').getTime();
    filtered = allOrders.filter((o) => {
      const orderDate = o.paidAt ? (o.paidAt.toDate ? o.paidAt.toDate() : new Date(o.paidAt)) : (o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt)) : null);
      if (!orderDate) return false;
      const t = orderDate.getTime();
      return t >= startMs && t <= endMs;
    });
  }

  if (filtered.length === 0) {
    alert('Tidak ada data transaksi pada rentang tanggal yang dipilih untuk diunduh.');
    return;
  }

  filtered.sort((a, b) => {
    const tA = a.paidAt ? (a.paidAt.toMillis ? a.paidAt.toMillis() : new Date(a.paidAt).getTime()) : 0;
    const tB = b.paidAt ? (b.paidAt.toMillis ? b.paidAt.toMillis() : new Date(b.paidAt).getTime()) : 0;
    return tA - tB; // kronologis urut dari awal
  });

  let csvContent = '\uFEFF'; // UTF-8 BOM agar rapi di Microsoft Excel
  csvContent += '"No","Waktu Transaksi","Nomor Meja / Ojol","Jenis Layanan","Rincian Menu","Metode Pembayaran","Uang Diterima (Rp)","Kembalian (Rp)","Total Tagihan Masuk Omzet (Rp)","Nominal Transaksi (Rp)","Status Transaksi","Alasan Pembatalan"\r\n';

  filtered.forEach((o, index) => {
    const isBatal = isOrderCancelled(o);
    const waktu = formatDate(o.paidAt || o.createdAt);
    const meja = (o.isOjol ? `GoFood (${o.kodeOjol || 'Driver'})` : o.nomorMeja).replace(/"/g, '""');
    const tipe = (o.orderType || (o.isOjol ? 'take_away' : 'dine_in')).replace(/"/g, '""');
    const rincian = (o.items || [])
      .map((i) => `${i.qty || 1}x ${i.name || i.nama || 'Menu'}${i.note ? ` [${i.note}]` : ''}`)
      .join('; ')
      .replace(/"/g, '""');
    const metode = (o.paymentMethod || 'Tunai').replace(/"/g, '""');
    const cashRec = Number(o.cashReceived || 0);
    const changeAmt = Number(o.changeAmount || 0);
    const originalTotal = Number(o.totalHarga || 0);
    const omzetTotal = isBatal ? 0 : originalTotal;
    const statusText = isBatal ? 'DIBATALKAN' : 'LUNAS';
    const alasanText = (o.alasanBatal || (isBatal ? 'Dibatalkan oleh kasir' : '-')).replace(/"/g, '""');

    csvContent += `"${index + 1}","${waktu}","${meja}","${tipe}","${rincian}","${metode}",${cashRec},${changeAmt},${omzetTotal},${originalTotal},"${statusText}","${alasanText}"\r\n`;
  });

  const rangeLabel = startStr && endStr ? `${startStr}_sd_${endStr}` : 'Semua';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Rekap_Pemasukan_Saung_H_Amir_${rangeLabel}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------------------------
   7. CETAK STRUK BLUETOOTH THERMAL VIA NAVIGATOR.SHARE() & RAWBT
   -------------------------------------------------------------------------- */
function formatThermalReceiptText(group, mergedItems, cashReceived = null, changeAmount = null, isCancelled = false, alasanBatal = '') {
  const line = '--------------------------------';
  const dblLine = '================================';
  const width = 32;

  function center(text) {
    if (!text) return '';
    const str = String(text).trim();
    if (str.length >= width) return str;
    const pad = Math.floor((width - str.length) / 2);
    return ' '.repeat(pad) + str;
  }

  function row(left, right) {
    const l = String(left || '');
    const r = String(right || '');
    if (l.length + r.length + 1 <= width) {
      const space = width - l.length - r.length;
      return l + ' '.repeat(space) + r;
    }
    return l + '\n' + ' '.repeat(Math.max(0, width - r.length)) + r;
  }

  const waktu = formatDate(new Date());
  const displayTitle = group.isOjol
    ? `GoFood (${group.kodeOjol || 'Driver'})`
    : (group.nomorMeja || 'Take-Away');

  const lines = [
    dblLine,
    center('SAUNG HAJI AMIR'),
    center('Khas Masakan Sunda'),
    center('Cisauk, Legok, Tangerang'),
    center('Telp/WA: 0812-1956-9995'),
    line
  ];

  if (isCancelled) {
    lines.push(dblLine);
    lines.push(center('*** PESANAN DIBATALKAN ***'));
    if (alasanBatal) {
      lines.push(center(`Alasan: ${alasanBatal}`));
    }
    lines.push(dblLine);
  }

  lines.push(
    row('Waktu   :', waktu),
    row('Layanan :', displayTitle),
    line,
    row('MENU', 'SUBTOTAL'),
    line
  );

  mergedItems.forEach((item) => {
    const itemTitle = `${item.qty}x ${item.name}`;
    const subtotal = formatRupiah(item.subtotal);
    lines.push(row(itemTitle, subtotal));
    if (item.qty > 1) {
      lines.push(`   @${formatRupiah(item.price)}`);
    }
    if (item.note) {
      lines.push(`   *Catatan: ${item.note}`);
    }
  });

  lines.push(line);
  if (isCancelled) {
    lines.push(row('TOTAL TAGIHAN:', 'Rp 0 (BATAL)'));
    lines.push(row('Nominal Batal:', formatRupiah(group.totalHarga)));
  } else {
    lines.push(row('TOTAL TAGIHAN:', formatRupiah(group.totalHarga)));
    if (cashReceived !== null && cashReceived > 0) {
      lines.push(row('Bayar Tunai  :', formatRupiah(cashReceived)));
      lines.push(row('Kembalian    :', formatRupiah(changeAmount || 0)));
    }
  }

  lines.push(dblLine);
  lines.push(center(isCancelled ? 'TRANSAKSI INI DIBATALKAN' : 'Hatur Nuhun'));
  lines.push(dblLine);
  lines.push('\n');

  return lines.join('\n');
}

async function printCustomerReceipt(group, mergedItems, cashReceived = null, changeAmount = null, isCancelled = false, alasanBatal = '') {
  const strukText = formatThermalReceiptText(group, mergedItems, cashReceived, changeAmount, isCancelled, alasanBatal);
  const displayTitle = group.isOjol
    ? `GoFood (${group.kodeOjol || 'Driver'})`
    : (group.nomorMeja || 'Take-Away');

  // Prioritas 1: Gunakan navigator.share() agar browser HP memunculkan dialog "Bagikan" ke printer Bluetooth (RawBT)
  if (navigator.share) {
    try {
      await navigator.share({
        title: `Struk - ${displayTitle}`,
        text: strukText
      });
      showToast('Menu Cetak Struk / RawBT terbuka!', 'success');
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        // Pengguna membatalkan dialog share
        return;
      }
      console.warn('Gagal navigator.share, beralih ke fallback clipboard:', err);
    }
  }

  // Prioritas 2: Fallback salin teks struk murni ke clipboard
  try {
    await navigator.clipboard.writeText(strukText);
    alert('Teks Struk berhasil disalin ke clipboard!\nSilakan paste ke aplikasi printer Bluetooth thermal Anda (seperti RawBT).\n\n' + strukText);
  } catch (clipErr) {
    if (dom.printArea) {
      dom.printArea.innerHTML = `<pre style="font-family: monospace; font-size: 13px; line-height: 1.4; white-space: pre-wrap;">${strukText}</pre>`;
      window.print();
    }
  }
}

/* --------------------------------------------------------------------------
   8. Modal Tambah Menu Baru Khusus Kasir POS
   -------------------------------------------------------------------------- */
function openCustomMenuModal() {
  if (!dom.customMenuModal) return;
  dom.customMenuModal.style.display = 'flex';
  if (dom.customMenuName) {
    dom.customMenuName.value = '';
    dom.customMenuName.focus();
  }
  if (dom.customMenuPrice) dom.customMenuPrice.value = '';
  if (dom.customMenuGofoodPrice) dom.customMenuGofoodPrice.value = '';
  renderCustomMenuList();
}

function closeCustomMenuModal() {
  if (dom.customMenuModal) dom.customMenuModal.style.display = 'none';
}

async function handleSaveCustomMenu(e) {
  if (e) e.preventDefault();
  const name = (dom.customMenuName ? dom.customMenuName.value : '').trim();
  const category = (dom.customMenuCategory ? dom.customMenuCategory.value : 'Lauk') || 'Lauk';
  const price = Number(dom.customMenuPrice ? dom.customMenuPrice.value : 0);
  const goFoodPriceRaw = dom.customMenuGofoodPrice ? dom.customMenuGofoodPrice.value : '';
  const goFoodPrice = goFoodPriceRaw ? Number(goFoodPriceRaw) : price;

  if (!name) {
    alert('Nama menu wajib diisi.');
    if (dom.customMenuName) dom.customMenuName.focus();
    return;
  }
  if (!price || price <= 0) {
    alert('Harga reguler wajib diisi dengan nominal angka yang valid.');
    if (dom.customMenuPrice) dom.customMenuPrice.focus();
    return;
  }

  const btnSave = document.getElementById('btn-save-custom-menu');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = 'Menyimpan ke Firestore...';
  }

  try {
    const docData = {
      name: name,
      category: category,
      posCategory: category,
      customCategory: category,
      type: category === 'Minuman' ? 'drink' : (category === 'Sambal' ? 'sambal' : 'food'),
      price: price,
      dailyPrice: price,
      goFoodPrice: goFoodPrice,
      availableOnGoFood: true,
      description: `Menu tambahan kasir: ${name}`,
      specification: 'Porsi Standar',
      image: category === 'Minuman' ? 'assets/images/minumanminuman.jpeg' : (category === 'Sambal' ? 'assets/images/sambaldadakan.jpeg' : 'assets/images/ayamgoreng.jpeg'),
      imageAlt: name,
      isCustom: true,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'menus'), docData);

    // Reset form input
    if (dom.customMenuName) dom.customMenuName.value = '';
    if (dom.customMenuPrice) dom.customMenuPrice.value = '';
    if (dom.customMenuGofoodPrice) dom.customMenuGofoodPrice.value = '';

    showToast(`Menu "${name}" berhasil disimpan permanen ke database Firestore!`, 'success');
  } catch (err) {
    console.error('Gagal menyimpan menu ke Firestore:', err);
    alert('Gagal menyimpan menu: ' + (err.message || 'Kesalahan jaringan.'));
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = '💾 Simpan ke Database Menu';
    }
  }
}

async function deleteCustomMenuItem(id) {
  if (!confirm('Hapus menu ini secara permanen dari database Firestore?')) return;
  try {
    await deleteDoc(doc(db, 'menus', id));
    showToast('Menu tambahan berhasil dihapus dari database.', 'success');
  } catch (err) {
    console.error('Gagal menghapus menu dari Firestore:', err);
    alert('Gagal menghapus menu: ' + (err.message || 'Kesalahan jaringan.'));
  }
}

function renderCustomMenuList() {
  if (!dom.customMenuListItems) return;
  const items = (state.firestoreMenus || []).filter((item) => Boolean(item.isCustom));
  if (dom.customMenuCount) dom.customMenuCount.textContent = String(items.length);

  if (items.length === 0) {
    dom.customMenuListItems.innerHTML = `
      <p style="font-size: 0.82rem; color: #94a3b8; text-align: center; padding: 0.75rem;">
        Belum ada menu tambahan kasir tersimpan di database.
      </p>
    `;
    return;
  }

  dom.customMenuListItems.innerHTML = items.map((item) => `
    <div class="custom-menu-item-row">
      <div class="custom-menu-item-info">
        <span class="custom-menu-item-badge">${item.customCategory || item.category || 'Menu'}</span>
        <strong>${item.name}</strong>
        <span style="color: #15803d; font-weight: 700; margin-left: 0.5rem;">${formatRupiah(item.price)}</span>
      </div>
      <button type="button" class="btn-delete-custom-item" data-id="${item.id}" title="Hapus menu ini secara permanen">
        🗑️
      </button>
    </div>
  `).join('');

  dom.customMenuListItems.querySelectorAll('.btn-delete-custom-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteCustomMenuItem(id);
    });
  });
}

/* --------------------------------------------------------------------------
   8. SISTEM ALARM SIRINE DARURAT & FLASH MERAH PESANAN BARU KASIR POS
   -------------------------------------------------------------------------- */
let audioCtx = null;
let sirenInterval = null;
let isEmergencyAlarmActive = false;
let isKasirAlarmFirstLoad = true;
let knownNewOrderIds = new Set();
let selfCreatedOrderIds = new Set();

function ensureAudioContext() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    // silent fallback
  }
}

function playSirenCycle() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const duration = 1.2; // 1.2 detik siklus ayunan melolong

    // 1. Nada Sawtooth Melolong Naik-Turun (650Hz -> 1250Hz -> 650Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(650, now);
    osc1.frequency.linearRampToValueAtTime(1250, now + (duration * 0.5));
    osc1.frequency.linearRampToValueAtTime(650, now + duration);

    gain1.gain.setValueAtTime(0.5, now);
    gain1.gain.setValueAtTime(0.5, now + (duration * 0.9));
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    // 2. Harmonik Square Wave Alarm Melengking (900Hz -> 1450Hz -> 900Hz)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(900, now);
    osc2.frequency.linearRampToValueAtTime(1450, now + (duration * 0.5));
    osc2.frequency.linearRampToValueAtTime(900, now + duration);

    gain2.gain.setValueAtTime(0.25, now);
    gain2.gain.setValueAtTime(0.25, now + (duration * 0.9));
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + duration);
    osc2.start(now);
    osc2.stop(now + duration);
  } catch (err) {
    console.warn('Gagal membunyikan sirine alarm pesanan kasir:', err);
  }
}

function startEmergencyAlarm() {
  if (isEmergencyAlarmActive) return;
  isEmergencyAlarmActive = true;

  // 1. Animasi Layar Berkedip Merah Terang di Seluruh Layar Kasir
  document.body.classList.add('alarm-flash-active');

  // 2. Munculkan Banner Raksasa di Tengah Layar
  if (dom.newOrderAlarmOverlay) {
    dom.newOrderAlarmOverlay.style.display = 'flex';
  }

  // 3. Putar Suara Sirine Kebakaran Keras & Berulang (Looping tanpa henti)
  playSirenCycle();
  if (sirenInterval) clearInterval(sirenInterval);
  sirenInterval = setInterval(() => {
    if (!isEmergencyAlarmActive) {
      clearInterval(sirenInterval);
      return;
    }
    playSirenCycle();
  }, 1300);
}

function stopEmergencyAlarm() {
  isEmergencyAlarmActive = false;
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }

  // 1. Layar berhenti berkedip merah
  document.body.classList.remove('alarm-flash-active');

  // 2. Sembunyikan banner raksasa
  if (dom.newOrderAlarmOverlay) {
    dom.newOrderAlarmOverlay.style.display = 'none';
  }

  showToast('Alarm pesanan baru berhasil dimatikan.', 'info');
}

function setupNewOrderAlarmListener() {
  const q = query(
    collection(db, 'orders'),
    where('kitchenStatus', '==', 'baru')
  );

  onSnapshot(q, (snapshot) => {
    const currentIds = new Set();
    snapshot.forEach((docSnap) => {
      currentIds.add(docSnap.id);
    });

    if (!isKasirAlarmFirstLoad) {
      let hasExternalNewOrder = false;
      currentIds.forEach((id) => {
        // Jika ada ID baru yang belum pernah dicatat dan bukan dibuat sendiri di kasir saat ini
        if (!knownNewOrderIds.has(id)) {
          if (!selfCreatedOrderIds.has(id)) {
            hasExternalNewOrder = true;
          }
        }
      });

      if (hasExternalNewOrder) {
        startEmergencyAlarm();
      }
    } else {
      isKasirAlarmFirstLoad = false;
    }

    knownNewOrderIds = currentIds;
  }, (err) => {
    console.warn('Listener alarm pesanan baru kasir error:', err);
  });
}

/* --------------------------------------------------------------------------
   9. Inisialisasi & Event Listeners
   -------------------------------------------------------------------------- */
function init() {
  checkAuth();

  // Pastikan Tab Kasir (Tagihan Meja) aktif secara default saat kasir dibuka
  switchTab('pane-tagihan');

  renderCategories();
  renderMenuGrid();
  renderCart();

  // Aktifkan Audio Context saat interaksi pertama
  document.addEventListener('click', ensureAudioContext, { once: true });

  // Auth Events
  if (dom.pinForm) dom.pinForm.addEventListener('submit', handlePinSubmit);
  if (dom.pinSubmitBtn) dom.pinSubmitBtn.addEventListener('click', handlePinSubmit);

  // Bottom Navigation Bar RestoQu Events
  if (dom.bottomBtnHome) dom.bottomBtnHome.addEventListener('click', () => switchTab('pane-home'));
  if (dom.bottomBtnKasir) dom.bottomBtnKasir.addEventListener('click', () => switchTab('pane-tagihan'));
  if (dom.bottomBtnAdd) dom.bottomBtnAdd.addEventListener('click', () => switchTab('pane-input'));

  // Tombol X Tutup / Batal pada Header Katalog Menu (kembali ke Kasir)
  if (dom.btnCloseInputPane) dom.btnCloseInputPane.addEventListener('click', () => switchTab('pane-tagihan'));

  // Floating Checkout Bar RestoQu Events
  if (dom.btnFloatingCheckout) dom.btnFloatingCheckout.addEventListener('click', handleFloatingCheckoutClick);
  if (dom.floatingCheckoutBar) dom.floatingCheckoutBar.addEventListener('click', (e) => {
    if (dom.btnFloatingCheckout && !dom.btnFloatingCheckout.contains(e.target)) {
      handleFloatingCheckoutClick();
    }
  });

  // Tabs Nav Legacy Events
  if (dom.tabBtnInput) dom.tabBtnInput.addEventListener('click', () => switchTab('pane-input'));
  if (dom.tabBtnTagihan) dom.tabBtnTagihan.addEventListener('click', () => switchTab('pane-tagihan'));

  // Header Rekap shortcut button (jika diklik, alihkan ke tab Home)
  const openRekapBtns = [
    dom.btnOpenRekapModal,
    document.getElementById('btn-open-rekap')
  ];
  openRekapBtns.forEach((btn) => {
    if (btn) btn.addEventListener('click', () => switchTab('pane-home'));
  });

  const closeRekapBtns = [
    dom.btnCloseRekapModal,
    document.getElementById('btn-close-rekap'),
    ...document.querySelectorAll('.rekap-modal-close-btn, .btn-close-rekap')
  ];
  closeRekapBtns.forEach((btn) => {
    if (btn) btn.addEventListener('click', closeRekapModal);
  });

  const modalEl = dom.rekapModal || document.getElementById('rekap-modal') || document.getElementById('modal-rekap');
  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeRekapModal();
    });
  }

  // Tombol Escape keyboard untuk menutup modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCategoryPickerModal();
      const m = dom.rekapModal || document.getElementById('rekap-modal');
      if (m && (m.classList.contains('active') || m.style.display !== 'none')) {
        closeRekapModal();
      }
    }
  });

  // Tombol Matikan Alarm Sirine Pesanan Baru
  if (dom.btnStopAlarm) {
    dom.btnStopAlarm.addEventListener('click', stopEmergencyAlarm);
  }

  // Category Picker Modal Events
  if (dom.btnSelectCategory) {
    dom.btnSelectCategory.addEventListener('click', openCategoryPickerModal);
  }
  if (dom.btnCloseCategoryPicker) {
    dom.btnCloseCategoryPicker.addEventListener('click', closeCategoryPickerModal);
  }
  if (dom.btnCancelCategoryPicker) {
    dom.btnCancelCategoryPicker.addEventListener('click', closeCategoryPickerModal);
  }
  const modalCatEl = dom.modalCategoryPicker || document.getElementById('modal-category-picker');
  if (modalCatEl) {
    modalCatEl.addEventListener('click', (e) => {
      if (e.target === modalCatEl) closeCategoryPickerModal();
    });
  }

  // Search Input Events
  if (dom.searchInput) {
    dom.searchInput.addEventListener('input', (e) => {
      state.searchKeyword = e.target.value;
      if (dom.searchClearBtn) dom.searchClearBtn.hidden = !state.searchKeyword;
      renderMenuGrid();
    });
  }
  if (dom.searchClearBtn) {
    dom.searchClearBtn.addEventListener('click', () => {
      dom.searchInput.value = '';
      state.searchKeyword = '';
      dom.searchClearBtn.hidden = true;
      dom.searchInput.focus();
      renderMenuGrid();
    });
  }

  // Ojol & Cart Events
  if (dom.ojolToggle) dom.ojolToggle.addEventListener('change', handleOjolToggle);
  if (dom.clearCartBtn) dom.clearCartBtn.addEventListener('click', clearCart);
  if (dom.sendOrderBtn) dom.sendOrderBtn.addEventListener('click', sendOrderToFirestore);

  // Custom Menu Modal Events
  if (dom.btnOpenCustomMenu) {
    dom.btnOpenCustomMenu.addEventListener('click', openCustomMenuModal);
  }
  if (dom.btnCloseCustomMenuModal) {
    dom.btnCloseCustomMenuModal.addEventListener('click', closeCustomMenuModal);
  }
  if (dom.customMenuForm) {
    dom.customMenuForm.addEventListener('submit', handleSaveCustomMenu);
  }
  if (dom.customMenuModal) {
    dom.customMenuModal.addEventListener('click', (e) => {
      if (e.target === dom.customMenuModal) closeCustomMenuModal();
    });
  }

  // Edit Order Modal Events
  if (dom.btnCloseEditOrderModal) {
    dom.btnCloseEditOrderModal.addEventListener('click', closeEditOrderModal);
  }
  if (dom.btnCancelEditOrder) {
    dom.btnCancelEditOrder.addEventListener('click', closeEditOrderModal);
  }
  if (dom.btnSaveEditOrder) {
    dom.btnSaveEditOrder.addEventListener('click', handleSaveOrderEdits);
  }
  if (dom.editOrderModal) {
    dom.editOrderModal.addEventListener('click', (e) => {
      if (e.target === dom.editOrderModal) closeEditOrderModal();
    });
  }

  // Modal Sukses Bayar & Cetak Struk Pasca-Bayar Events
  if (dom.btnSuksesCetakStruk) {
    dom.btnSuksesCetakStruk.addEventListener('click', () => {
      if (activePaymentSuccessData) {
        const { group, mergedItems, cashReceived, changeAmount } = activePaymentSuccessData;
        printCustomerReceipt(group, mergedItems, cashReceived, changeAmount);
      }
    });
  }
  if (dom.btnSuksesSelesai) {
    dom.btnSuksesSelesai.addEventListener('click', closePaymentSuccessModal);
  }
  if (dom.modalSuksesBayar) {
    dom.modalSuksesBayar.addEventListener('click', (e) => {
      if (e.target === dom.modalSuksesBayar) closePaymentSuccessModal();
    });
  }

  // Cash Modal Events
  if (dom.cashReceivedInput) dom.cashReceivedInput.addEventListener('input', handleCashInput);
  if (dom.closeCashModal) dom.closeCashModal.addEventListener('click', closeCashModalHandler);
  if (dom.cancelCashBtn) dom.cancelCashBtn.addEventListener('click', closeCashModalHandler);
  if (dom.confirmCashBtn) dom.confirmCashBtn.addEventListener('click', processCashPayment);

  // Quick Cash Denomination Buttons
  if (dom.btnQuickExact) {
    dom.btnQuickExact.addEventListener('click', () => {
      if (activeCashModalGroup) {
        dom.cashReceivedInput.value = activeCashModalGroup.group.totalHarga;
        handleCashInput();
      }
    });
  }
  document.querySelectorAll('.quick-cash-btn[data-val]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      dom.cashReceivedInput.value = val;
      handleCashInput();
    });
  });

  // Rekap Presets & Filters
  document.querySelectorAll('.btn-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      setPresetDates(preset);
    });
  });
  if (dom.btnApplyFilter) dom.btnApplyFilter.addEventListener('click', applyRekapFilter);
  if (dom.btnDownloadCsv) dom.btnDownloadCsv.addEventListener('click', downloadFilteredCsv);

  // Modal Batalkan Transaksi Rekap Events
  if (dom.btnCloseModalBatal) {
    dom.btnCloseModalBatal.addEventListener('click', closeBatalOrderModal);
  }
  if (dom.btnCancelBatalDialog) {
    dom.btnCancelBatalDialog.addEventListener('click', closeBatalOrderModal);
  }
  if (dom.btnConfirmBatalOrder) {
    dom.btnConfirmBatalOrder.addEventListener('click', handleConfirmBatalOrder);
  }
  if (dom.modalBatalTransaksi) {
    dom.modalBatalTransaksi.addEventListener('click', (e) => {
      if (e.target === dom.modalBatalTransaksi) closeBatalOrderModal();
    });
  }
  document.querySelectorAll('.btn-batal-chip[data-reason]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const reason = chip.getAttribute('data-reason');
      if (dom.batalReasonInput) {
        dom.batalReasonInput.value = reason;
        dom.batalReasonInput.focus();
      }
    });
  });

  // Initialize Default Rekap Date (Hari Ini)
  setPresetDates('today');

  // Listeners Firestore
  setupCashierBillsListener();
  setupDailyRecapListener();
  setupNewOrderAlarmListener();
  setupRealtimeMenusListener();

  // Inisialisasi PWA (Service Worker & Tombol Instal)
  setupPwa();
}

/* --------------------------------------------------------------------------
   8. PROGRESSIVE WEB APP (PWA): SERVICE WORKER & INSTALL PROMPT
   -------------------------------------------------------------------------- */
let deferredPwaPrompt = null;

function setupPwa() {
  // 1. Registrasi Service Worker untuk PWA Offline & Installable
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker terdaftar dengan scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Gagal mendaftarkan Service Worker:', err);
        });
    });
  }

  // 2. Tangkap event beforeinstallprompt
  const btnInstall = document.getElementById('btn-pwa-install');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if (btnInstall) {
      btnInstall.style.display = 'inline-flex';
    }
  });

  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (!deferredPwaPrompt) return;
      deferredPwaPrompt.prompt();
      const choiceResult = await deferredPwaPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        showToast('Aplikasi Kasir berhasil dipasang di layar utama!', 'success');
        btnInstall.style.display = 'none';
      }
      deferredPwaPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplikasi Kasir berhasil dipasang.');
    if (btnInstall) {
      btnInstall.style.display = 'none';
    }
    showToast('Aplikasi Kasir kini aktif di HP Anda.', 'success');
  });
}

document.addEventListener('DOMContentLoaded', init);
