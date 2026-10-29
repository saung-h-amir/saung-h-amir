/**
 * Saung H. Amir - POS Kasir, Tagihan Meja & Rekap Terpadu
 * File: js/kasir.js
 */

import { menuData, POS_CATEGORIES, getMenuPosCategory } from './data.js';
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
  writeBatch,
  serverTimestamp,
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
  activeTab: 'pane-input',
  activeCategory: 'Semua',
  searchKeyword: '',
  isOjol: false,
  cart: [],
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
  posLockBtn: document.getElementById('pos-lock-btn'),
  liveClock: document.getElementById('pos-live-clock'),

  // Tabs Nav
  tabBtnInput: document.getElementById('tab-btn-input'),
  tabBtnTagihan: document.getElementById('tab-btn-tagihan'),
  tabBtnRekap: document.getElementById('tab-btn-rekap'),
  paneInput: document.getElementById('pane-input'),
  paneTagihan: document.getElementById('pane-tagihan'),
  paneRekap: document.getElementById('pane-rekap'),
  badgeUnpaidTables: document.getElementById('badge-unpaid-tables'),
  badgeRekapTotal: document.getElementById('badge-rekap-total'),

  // Tab 1: Input Pesanan
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

  // Tab 3: Rekap
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
  rekapTableBody: document.getElementById('rekap-table-body'),
  btnDownloadCsv: document.getElementById('btn-download-csv'),

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
   2. Navigasi 3 Tab Utama Kasir POS
   -------------------------------------------------------------------------- */
function switchTab(tabId) {
  state.activeTab = tabId;
  [dom.tabBtnInput, dom.tabBtnTagihan, dom.tabBtnRekap].forEach((btn) => {
    if (btn) {
      const isActive = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  });

  [dom.paneInput, dom.paneTagihan, dom.paneRekap].forEach((pane) => {
    if (pane) {
      pane.classList.toggle('active', pane.id === tabId);
    }
  });
}

/* --------------------------------------------------------------------------
   3. TAB 1: INPUT PESANAN (MENU GRID SUPER RAPAT - NAMA & HARGA SAJA)
   -------------------------------------------------------------------------- */
const categoriesList = POS_CATEGORIES;

/* --------------------------------------------------------------------------
   Custom Menu Management (Disimpan Lokal Khusus Kasir POS)
   -------------------------------------------------------------------------- */
const CUSTOM_MENU_KEY = 'saha_pos_custom_items';

function loadCustomMenuItems() {
  try {
    const raw = localStorage.getItem(CUSTOM_MENU_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Gagal membaca custom menu dari localStorage:', e);
    return [];
  }
}

function saveCustomMenuItems(items) {
  try {
    localStorage.setItem(CUSTOM_MENU_KEY, JSON.stringify(items || []));
  } catch (e) {
    console.warn('Gagal menyimpan custom menu ke localStorage:', e);
  }
}

function getCatalog() {
  const custom = loadCustomMenuItems();
  return [...menuData, ...custom];
}

function renderCategories() {
  if (!dom.categoriesContainer) return;
  dom.categoriesContainer.innerHTML = '';

  categoriesList.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pos-category-btn ${state.activeCategory === cat ? 'active' : ''}`;
    btn.textContent = cat;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', state.activeCategory === cat ? 'true' : 'false');

    btn.addEventListener('click', () => {
      state.activeCategory = cat;
      renderCategories();
      renderMenuGrid();
    });

    dom.categoriesContainer.appendChild(btn);
  });
}

function renderMenuGrid() {
  if (!dom.menuGrid) return;
  const catalog = getCatalog();
  const keyword = state.searchKeyword.toLowerCase().trim();

  let filtered = catalog;

  // Filter Kategori Sesuai Katalog Menu Asli
  if (state.activeCategory !== 'Semua') {
    filtered = filtered.filter((item) => {
      const cat = getMenuPosCategory(item);
      return cat === state.activeCategory;
    });
  }

  // Filter Pencarian
  if (keyword) {
    filtered = filtered.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const cat = getMenuPosCategory(item).toLowerCase();
      return name.includes(keyword) || cat.includes(keyword);
    });
  }

  if (dom.ojolMenuCount) {
    dom.ojolMenuCount.textContent = state.isOjol
      ? `${filtered.length} Menu (Harga GoFood)`
      : `${filtered.length} Menu`;
  }

  dom.menuGrid.innerHTML = '';

  if (filtered.length === 0) {
    dom.menuGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 2rem 1rem; color: #94a3b8;">
        <span style="font-size: 1.8rem; display: block; margin-bottom: 0.3rem;">🔍</span>
        <p style="font-weight: 700; font-size: 0.9rem;">Menu tidak ditemukan</p>
      </div>
    `;
    return;
  }

  // SESUAI PERMINTAAN USER: HANYA NAMA MENU (TEBAL) & HARGA (HIJAU)
  filtered.forEach((item) => {
    const itemPrice = state.isOjol ? (item.goFoodPrice || Math.round(item.price * 1.2)) : item.price;
    const isCustom = Boolean(item.isCustom);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pos-menu-btn ${state.isOjol ? 'ojol-active' : ''} ${isCustom ? 'is-custom-item' : ''}`;
    btn.setAttribute('title', `Tambah ${item.name} (${formatRupiah(itemPrice)})${isCustom ? ' [Menu Kasir]' : ''}`);

    btn.innerHTML = `
      <strong class="pos-menu-btn-name">${item.name}</strong>
      <span class="pos-menu-btn-price">${formatRupiah(itemPrice)}</span>
    `;

    btn.addEventListener('click', () => {
      addItemToCart(item);
    });

    dom.menuGrid.appendChild(btn);
  });
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

function renderCart() {
  if (!dom.cartItemsContainer) return;

  const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);
  const totalHarga = state.cart.reduce((sum, item) => sum + (item.qty * item.price), 0);

  if (dom.cartCountBadge) dom.cartCountBadge.textContent = `${totalItems} Item`;
  if (dom.cartTotal) dom.cartTotal.textContent = formatRupiah(totalHarga);

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

    await addDoc(collection(db, 'orders'), payload);

    const successMsg = state.isOjol
      ? `Pesanan GoFood/Grab (${kodeOjol}) berhasil dikirim ke Dapur!`
      : `Pesanan ${nomorMeja} berhasil dikirim ke Dapur! ${isAddon ? '(Pesanan Tambahan)' : ''}`;

    showToast(successMsg, 'success');
    state.cart = [];
    renderCart();
    if (dom.ojolCodeInput) dom.ojolCodeInput.value = '';

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
      const groupKey = order.isOjol
        ? `Ojol-${order.kodeOjol || order.kodeReferensi || order.id}`
        : order.nomorMeja;

      if (!tableGroups[groupKey]) {
        tableGroups[groupKey] = {
          groupKey: groupKey,
          nomorMeja: order.nomorMeja,
          isOjol: Boolean(order.isOjol),
          kodeOjol: order.kodeOjol || order.kodeReferensi || '',
          tickets: [],
          totalHarga: 0,
          customerName: order.customerName || '',
          phone: order.phone || ''
        };
      }

      tableGroups[groupKey].tickets.push(order);
      tableGroups[groupKey].totalHarga += Number(order.totalHarga || 0);
    });

    const groupsArray = Object.values(tableGroups);

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
    card.className = 'bill-card';

    const ticketCount = group.tickets.length;
    const isMultiple = ticketCount > 1;

    const displayTitle = group.isOjol
      ? `🛵 [GOFOOD - ${group.kodeOjol || 'Driver'}]`
      : group.nomorMeja;

    // Konsolidasikan daftar menu
    const mergedItems = [];
    group.tickets.forEach((ticket, tIdx) => {
      (ticket.items || []).forEach((item) => {
        mergedItems.push({
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
      <div class="bill-item-row">
        <span class="bill-item-title">
          ${item.qty}x ${item.name} ${item.note ? `<small style="color: #94a3b8;">(${item.note})</small>` : ''}
          ${isMultiple ? `<small style="color: #3b82f6; font-size: 0.7rem;">[Tiket #${item.ticketNum}]</small>` : ''}
        </span>
        <span class="bill-item-amount">${formatRupiah(item.subtotal)}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <header class="bill-card-header">
        <div class="bill-table-info">
          <strong class="bill-table-name">${displayTitle}</strong>
          ${isMultiple ? `<span class="bill-tickets-merged-badge">📦 ${ticketCount} Tiket Tergabung</span>` : ''}
        </div>
        <div class="bill-total-header">${formatRupiah(group.totalHarga)}</div>
      </header>

      <div class="bill-items-list">
        ${itemsHtml}
      </div>

      <footer class="bill-footer">
        <button type="button" class="btn-bill-print">
          <span>🖨️</span>
          <span>Cetak Struk Tagihan</span>
        </button>

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
      }
    });

    // Event Lunas Debit
    card.querySelector('.btn-settle-debit').addEventListener('click', async () => {
      if (confirm(`Konfirmasi pelunasan tagihan ${displayTitle} (${formatRupiah(group.totalHarga)}) via Debit?`)) {
        await settleTableBill(group, 'Debit', group.totalHarga, 0);
      }
    });

    dom.cashierBillsContainer.appendChild(card);
  });
}

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

    // Tawarkan cetak struk
    setTimeout(() => {
      if (confirm('Cetak Struk Pembayaran Konsumen sekarang?')) {
        printCustomerReceipt(group, mergedItems, received, change);
      }
    }, 200);

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
   6. TAB 3: REKAP PEMASUKAN DENGAN RENTANG WAKTU (HARIAN / MINGGUAN)
   -------------------------------------------------------------------------- */
function setupDailyRecapListener() {
  const q = query(
    collection(db, 'orders'),
    where('paymentStatus', '==', 'lunas')
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
    const tA = a.paidAt ? (a.paidAt.toMillis ? a.paidAt.toMillis() : new Date(a.paidAt).getTime()) : 0;
    const tB = b.paidAt ? (b.paidAt.toMillis ? b.paidAt.toMillis() : new Date(b.paidAt).getTime()) : 0;
    return tB - tA;
  });

  calculateAndRenderRekap(filtered, startStr, endStr);
}

function calculateAndRenderRekap(orders, startStr, endStr) {
  let totalTunai = 0, countTunai = 0;
  let totalQris = 0, countQris = 0;
  let totalDebit = 0, countDebit = 0;
  let grandTotal = 0;

  orders.forEach((o) => {
    const amount = Number(o.totalHarga || 0);
    const method = String(o.paymentMethod || 'Tunai');
    grandTotal += amount;

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
  if (dom.kpiTotalTransaksi) dom.kpiTotalTransaksi.textContent = `Total ${orders.length} transaksi selesai`;

  if (dom.badgeRekapTotal) dom.badgeRekapTotal.textContent = formatRupiah(grandTotal);

  // Render Tabel
  if (!dom.rekapTableBody) return;

  if (orders.length === 0) {
    dom.rekapTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #94a3b8; padding: 2rem;">
          Tidak ada transaksi lunas pada rentang tanggal yang dipilih.
        </td>
      </tr>
    `;
    return;
  }

  dom.rekapTableBody.innerHTML = orders.map((o, idx) => {
    const waktu = formatDate(o.paidAt || o.createdAt);
    const mejaText = o.isOjol
      ? `🛵 GoFood (${o.kodeOjol || o.kodeReferensi || 'Driver'})`
      : o.nomorMeja;

    const itemsSummary = (o.items || [])
      .map((i) => `${i.qty || 1}x ${i.name || i.nama || 'Menu'}`)
      .join(', ');

    const method = o.paymentMethod || 'Tunai';

    return `
      <tr>
        <td style="color: #94a3b8;">${idx + 1}</td>
        <td>${waktu}</td>
        <td><strong>${mejaText}</strong></td>
        <td style="max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsSummary}">
          ${itemsSummary}
        </td>
        <td><span class="badge-method ${method}">${method}</span></td>
        <td style="text-align: right; font-weight: 800; color: #15803d;">
          ${formatRupiah(o.totalHarga)}
        </td>
      </tr>
    `;
  }).join('');
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
    alert('Tidak ada data transaksi lunas pada rentang tanggal yang dipilih untuk diunduh.');
    return;
  }

  filtered.sort((a, b) => {
    const tA = a.paidAt ? (a.paidAt.toMillis ? a.paidAt.toMillis() : new Date(a.paidAt).getTime()) : 0;
    const tB = b.paidAt ? (b.paidAt.toMillis ? b.paidAt.toMillis() : new Date(b.paidAt).getTime()) : 0;
    return tA - tB; // kronologis urut dari awal
  });

  let csvContent = '\uFEFF'; // UTF-8 BOM agar rapi di Microsoft Excel
  csvContent += '"No","Waktu Transaksi","Nomor Meja / Ojol","Jenis Layanan","Rincian Menu","Metode Pembayaran","Uang Diterima (Rp)","Kembalian (Rp)","Total Tagihan (Rp)"\r\n';

  filtered.forEach((o, index) => {
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
    const total = Number(o.totalHarga || 0);

    csvContent += `"${index + 1}","${waktu}","${meja}","${tipe}","${rincian}","${metode}",${cashRec},${changeAmt},${total}\r\n`;
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
   7. CETAK STRUK BLUETOOTH THERMAL 58MM / 80MM
   -------------------------------------------------------------------------- */
function printCustomerReceipt(group, mergedItems, cashReceived = null, changeAmount = null) {
  if (!dom.printArea) return;

  const waktu = formatDate(new Date());
  const displayTitle = group.isOjol
    ? `GoFood / Grab (${group.kodeOjol || 'Driver'})`
    : group.nomorMeja;

  const itemsList = mergedItems.map((item) => `
    <div class="print-row">
      <span class="print-item-title">${item.name}</span>
      <span>${formatRupiah(item.subtotal)}</span>
    </div>
    <div class="print-row" style="font-size: 10px; color: #333;">
      <span>  ${item.qty} x ${formatRupiah(item.price)}</span>
    </div>
    ${item.note ? `<div class="print-item-note">  (${item.note})</div>` : ''}
  `).join('');

  let cashDetailHtml = '';
  if (cashReceived !== null && cashReceived > 0) {
    cashDetailHtml = `
      <div class="print-row"><span>Bayar Tunai:</span><span>${formatRupiah(cashReceived)}</span></div>
      <div class="print-row"><span>Kembalian:</span><span>${formatRupiah(changeAmount || 0)}</span></div>
    `;
  }

  dom.printArea.innerHTML = `
    <div class="print-center print-header-title">SAUNG HAJI AMIR</div>
    <div class="print-center">Masakan Khas Tradisional Sunda</div>
    <div class="print-center">Cileutik, Jl. Raya Cisauk, Legok, Tangerang</div>
    <div class="print-center">Telp/WA: 0812-1956-9995</div>
    <div class="print-divider"></div>
    <div class="print-row"><span>Tanggal :</span><span>${waktu}</span></div>
    <div class="print-row"><span>Layanan :</span><strong class="print-item-title">${displayTitle}</strong></div>
    <div class="print-row"><span>Status  :</span><strong>STRUK PEMBAYARAN</strong></div>
    <div class="print-double-divider"></div>
    <div class="print-row print-bold">
      <span>MENU</span>
      <span>SUBTOTAL</span>
    </div>
    <div class="print-divider"></div>
    ${itemsList}
    <div class="print-divider"></div>
    <div class="print-row print-total-big">
      <span>TOTAL TAGIHAN:</span>
      <span>${formatRupiah(group.totalHarga)}</span>
    </div>
    ${cashDetailHtml}
    <div class="print-double-divider"></div>
    <div class="print-center print-bold">Hatur Nuhun Parantos Sumping!</div>
    <div class="print-center">Selamat Menikmati Hidangan Kami</div>
  `;

  window.print();
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

function handleSaveCustomMenu(e) {
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

  const newItem = {
    id: 'custom-' + Date.now(),
    name: name,
    category: category,
    posCategory: category,
    customCategory: category,
    price: price,
    dailyPrice: price,
    goFoodPrice: goFoodPrice,
    availableOnGoFood: true,
    isCustom: true
  };

  const existing = loadCustomMenuItems();
  existing.push(newItem);
  saveCustomMenuItems(existing);

  // Reset form input
  if (dom.customMenuName) dom.customMenuName.value = '';
  if (dom.customMenuPrice) dom.customMenuPrice.value = '';
  if (dom.customMenuGofoodPrice) dom.customMenuGofoodPrice.value = '';

  renderCustomMenuList();
  renderMenuGrid();
  showToast(`Menu "${name}" berhasil ditambahkan ke Kasir POS!`, 'success');
}

function deleteCustomMenuItem(id) {
  const existing = loadCustomMenuItems();
  const filtered = existing.filter((item) => item.id !== id);
  saveCustomMenuItems(filtered);
  renderCustomMenuList();
  renderMenuGrid();
  showToast('Menu tambahan kasir berhasil dihapus.', '');
}

function renderCustomMenuList() {
  if (!dom.customMenuListItems) return;
  const items = loadCustomMenuItems();
  if (dom.customMenuCount) dom.customMenuCount.textContent = String(items.length);

  if (items.length === 0) {
    dom.customMenuListItems.innerHTML = `
      <p style="font-size: 0.82rem; color: #94a3b8; text-align: center; padding: 0.75rem;">
        Belum ada menu tambahan kasir tersimpan.
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
      <button type="button" class="btn-delete-custom-item" data-id="${item.id}" title="Hapus menu ini">
        🗑️
      </button>
    </div>
  `).join('');

  dom.customMenuListItems.querySelectorAll('.btn-delete-custom-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Hapus menu tambahan kasir ini?')) {
        deleteCustomMenuItem(id);
      }
    });
  });
}

/* --------------------------------------------------------------------------
   9. Inisialisasi & Event Listeners
   -------------------------------------------------------------------------- */
function init() {
  checkAuth();
  startClock();
  renderCategories();
  renderMenuGrid();
  renderCart();

  // Auth Events
  if (dom.pinForm) dom.pinForm.addEventListener('submit', handlePinSubmit);
  if (dom.pinSubmitBtn) dom.pinSubmitBtn.addEventListener('click', handlePinSubmit);
  if (dom.posLockBtn) dom.posLockBtn.addEventListener('click', lockPOS);

  // Tabs Nav Events
  if (dom.tabBtnInput) dom.tabBtnInput.addEventListener('click', () => switchTab('pane-input'));
  if (dom.tabBtnTagihan) dom.tabBtnTagihan.addEventListener('click', () => switchTab('pane-tagihan'));
  if (dom.tabBtnRekap) dom.tabBtnRekap.addEventListener('click', () => switchTab('pane-rekap'));

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

  // Initialize Default Rekap Date (Hari Ini)
  setPresetDates('today');

  // Listeners Firestore
  setupCashierBillsListener();
  setupDailyRecapListener();
}

document.addEventListener('DOMContentLoaded', init);
