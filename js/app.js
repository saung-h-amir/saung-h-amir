import { menuData, MAIN_TABS, CATEGORIES, migrateMenusToFirestore } from './data.js';
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

// Data menu dinamis dari Firestore (fallback awal menggunakan menuData bawaan)
let PRODUCTS = [...menuData];

// Format Rupiah
const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});
function formatRupiah(amount) {
  return currencyFormatter.format(amount || 0);
}

function isValidQuantity(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 && num <= 99;
}

function parseDateParts(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) return null;
  return { year, month, day, utcTime: utcDate.getTime() };
}

function getTodayUtcTime() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function validateReservationDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
    return { valid: false, message: 'Pilih tanggal kedatangan/pengambilan.' };
  }
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) {
    return { valid: false, message: 'Format tanggal tidak valid.' };
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return { valid: false, message: 'Format tanggal tidak valid.' };
  }

  const selectedDate = new Date(year, month, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (selectedDate < today) {
    return { valid: false, message: 'Tanggal reservasi tidak boleh sebelum hari ini.' };
  }
  return { valid: true, message: '' };
}

function addOrIncrementItem(items, productId, incrementBy = 1, option = '', customPrice = null) {
  const optClean = (option || '').trim();
  const existingIndex = (items || []).findIndex(
    (item) => item.productId === productId && (item.option || '').trim() === optClean
  );
  if (existingIndex === -1) {
    const qty = Math.min(99, Math.max(1, incrementBy));
    const newItem = { productId, quantity: qty, option: optClean };
    if (typeof customPrice === 'number' && customPrice > 0) newItem.customPrice = customPrice;
    return [...(items || []), newItem];
  }
  return items.map((item, idx) => {
    if (idx !== existingIndex) return item;
    return { ...item, quantity: Math.min(99, item.quantity + incrementBy) };
  });
}

function updateItemQuantity(items, productId, nextQuantity, option = '') {
  if (!isValidQuantity(nextQuantity)) return { valid: false, items };
  const optClean = (option || '').trim();
  const qty = Number(nextQuantity);
  return {
    valid: true,
    items: (items || []).map((item) =>
      item.productId === productId && (item.option || '').trim() === optClean
        ? { ...item, quantity: qty }
        : item
    )
  };
}

function removeItem(items, productId, option = '') {
  const optClean = (option || '').trim();
  return (items || []).filter(
    (item) => !(item.productId === productId && (item.option || '').trim() === optClean)
  );
}

function calculateCartSummary(items, catalog, reservationDate, isOjol = false) {
  const dateCheck = validateReservationDate(reservationDate);
  const catalogMap = new Map((catalog || []).map((product) => [product.id, product]));
  const detailedItems = [];
  let totalUnits = 0;
  let totalPrice = 0;
  const markupMultiplier = isOjol ? 1.2 : 1.0;

  for (const item of (items || [])) {
    const product = catalogMap.get(item.productId);
    if (!product || !isValidQuantity(item.quantity)) continue;

    const basePrice =
      typeof item.customPrice === 'number' && item.customPrice > 0
        ? item.customPrice
        : (product.dailyPrice || product.price);

    const unitPrice = isOjol ? Math.round(basePrice * markupMultiplier) : basePrice;
    const subtotal = unitPrice * item.quantity;
    totalUnits += item.quantity;
    totalPrice += subtotal;

    detailedItems.push({
      productId: product.id,
      name: product.name,
      specification: product.specification,
      option: (item.option || '').trim(),
      basePrice: basePrice,
      unitPrice: unitPrice,
      customPrice: item.customPrice || null,
      quantity: item.quantity,
      subtotal
    });
  }

  return {
    items: detailedItems,
    totalUnits,
    totalPrice: dateCheck.valid ? totalPrice : 0,
    rawTotalPrice: totalPrice,
    dateValid: dateCheck.valid,
    dateMessage: dateCheck.message,
    isOjol: Boolean(isOjol)
  };
}

const STORAGE_KEY = 'saung-h-amir:cart:v1';
const SCHEMA_VERSION = 1;

function loadCartDraft(catalog) {
  const defaultState = {
    items: [],
    reservationDate: '',
    serviceType: 'dine-in',
    reservationTime: '12:00',
    needHandGlove: false,
    takeawayMethod: 'self-pickup',
    tableNumber: '',
    isOjol: false,
    ojolRefCode: '',
    storageAvailable: true,
    expiredDateCleared: false
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return defaultState;
    return {
      ...defaultState,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      reservationDate: parsed.reservationDate || '',
      serviceType: parsed.serviceType || 'dine-in',
      reservationTime: parsed.reservationTime || '12:00',
      needHandGlove: Boolean(parsed.needHandGlove),
      takeawayMethod: parsed.takeawayMethod || 'self-pickup',
      tableNumber: parsed.tableNumber || '',
      isOjol: Boolean(parsed.isOjol),
      ojolRefCode: parsed.ojolRefCode || ''
    };
  } catch (e) {
    return defaultState;
  }
}

function saveCartDraft(items, reservationDate, serviceType, reservationTime, needHandGlove, takeawayMethod, tableNumber, isOjol, ojolRefCode) {
  try {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      items: items || [],
      reservationDate: reservationDate || '',
      serviceType: serviceType || 'dine-in',
      reservationTime: reservationTime || '12:00',
      needHandGlove: Boolean(needHandGlove),
      takeawayMethod: takeawayMethod || 'self-pickup',
      tableNumber: tableNumber || '',
      isOjol: Boolean(isOjol),
      ojolRefCode: ojolRefCode || ''
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

async function checkIsAddonOrder(nomorMeja) {
  if (!nomorMeja || nomorMeja === 'Take-Away' || nomorMeja === 'Take-Away (Bungkus)') return false;
  try {
    const q = query(
      collection(db, 'orders'),
      where('nomorMeja', '==', nomorMeja),
      where('paymentStatus', '==', 'belum_lunas')
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.warn('Gagal periksa status addon meja di Firestore:', err);
    return false;
  }
}

async function sendOrderToFirestore(orderPayload) {
  let isAddon = false;
  if (orderPayload.orderType !== 'take_away') {
    isAddon = await checkIsAddonOrder(orderPayload.nomorMeja);
  }
  const payload = {
    ...orderPayload,
    isAddon: isAddon,
    createdAt: serverTimestamp()
  };
  const docRef = await addDoc(collection(db, 'orders'), payload);
  return {
    success: true,
    orderId: docRef.id,
    isAddon: isAddon,
    data: payload
  };
}

function validateCheckoutForm(formData) {
  const errors = {};
  const isOjolActive = Boolean(formData && formData.isOjol);
  const trimmedTable = ((formData && formData.tableNumber) || '').trim();
  const trimmedRefCode = ((formData && formData.ojolRefCode) || '').trim();
  let trimmedName = ((formData && formData.customerName) || '').trim();
  const trimmedGroup = ((formData && formData.groupName) || '').trim();
  const trimmedNotes = ((formData && formData.notes) || '').trim();
  const trimmedGuest = ((formData && formData.guestCount) || '').trim();
  const rawPhone = ((formData && formData.phone) || '').trim().replace(/[\s\-()]/g, '');
  const normalizedPhone = rawPhone.startsWith('+') ? rawPhone.slice(1) : rawPhone;
  const selectedService =
    trimmedTable === 'Take-Away (Bungkus)' || trimmedTable === 'Take-Away' || isOjolActive
      ? 'take-away'
      : (formData && formData.serviceType === 'take-away' ? 'take-away' : 'dine-in');
  const trimmedTime = ((formData && formData.reservationTime) || '12:00').trim();
  const isHandGloveNeeded = Boolean(formData && formData.needHandGlove);
  const selectedTakeawayMethod = formData && formData.takeawayMethod === 'gosend' ? 'gosend' : 'self-pickup';

  if (!trimmedTable) {
    errors.tableNumber = 'Pilih nomor meja (Meja 1–15) atau Take-Away.';
  }

  if (isOjolActive) {
    if (!trimmedRefCode) {
      errors.ojolRefCode = 'Masukkan Kode Referensi Pesanan (contoh: GF-1234 atau 4 digit).';
    }
    if (!trimmedName) {
      trimmedName = `Driver Ojol (${trimmedRefCode || 'GoFood'})`;
    }
  } else {
    if (trimmedName.length < 2) {
      errors.customerName = 'Nama pemesan minimal 2 karakter.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      tableNumber: trimmedTable || (isOjolActive ? 'Take-Away' : 'Meja 1'),
      isOjol: isOjolActive,
      ojolRefCode: trimmedRefCode,
      customerName: trimmedName || (isOjolActive ? 'Driver Ojol' : 'Pelanggan Meja'),
      groupName: trimmedGroup || '-',
      phone: normalizedPhone || '-',
      serviceType: selectedService,
      serviceLabel: selectedService === 'dine-in' ? `Makan di Tempat (${trimmedTable})` : 'Take-Away (Bungkus)',
      reservationTime: trimmedTime || '12:00',
      guestCount: trimmedGuest || '-',
      notes: trimmedNotes || '-',
      needHandGlove: isHandGloveNeeded,
      takeawayMethod: selectedTakeawayMethod
    }
  };
}

function initApp() {

    const state = {
      activeTab: 'makanan', // 'makanan' | 'berlima' | 'minuman' | 'sambal'
      searchQuery: '',
      selectedCategory: 'Semua',
      items: [],
      reservationDate: '',
      serviceType: 'dine-in', // 'dine-in' | 'take-away'
      reservationTime: '12:00',
      needHandGlove: false,
      takeawayMethod: 'self-pickup', // 'self-pickup' | 'gosend'
      tableNumber: '',
      isOjol: false,
      ojolRefCode: '',
      isReviewed: false,
      storageWarning: false,
      productSugarSelection: {} // map of productId -> 'Normal Sugar' | 'Less Sugar'
    };

    const elements = {
      catalogTabs: document.getElementById('catalog-tabs'),
      categoryFilters: document.getElementById('category-filters'),
      searchInput: document.getElementById('search-input'),
      resetFilterBtn: document.getElementById('reset-filter-btn'),
      catalogCount: document.getElementById('catalog-count'),
      catalogGrid: document.getElementById('catalog-grid'),
      emptyCatalogState: document.getElementById('empty-catalog'),
      cartJumpCount: document.getElementById('cart-jump-count'),
      cartItemsContainer: document.getElementById('cart-items'),
      emptyCartMessage: document.getElementById('empty-cart-message'),
      reservationDateInput: document.getElementById('reservation-date'),
      reservationTimeInput: document.getElementById('reservation-time'),
      timeError: document.getElementById('time-error'),
      serviceTypeDineIn: document.getElementById('service-dine-in'),
      serviceTypeTakeAway: document.getElementById('service-take-away'),
      guestCountInput: document.getElementById('guest-count'),
      guestCountGroup: document.getElementById('guest-count-group'),
      guestError: document.getElementById('guest-error'),
      takeawayMethodGroup: document.getElementById('takeaway-method-group'),
      takeawaySelf: document.getElementById('takeaway-self'),
      takeawayGosend: document.getElementById('takeaway-gosend'),
      gosendNotice: document.getElementById('gosend-notice'),
      handgloveGroup: document.getElementById('handglove-group'),
      handgloveYes: document.getElementById('handglove-yes'),
      handgloveNo: document.getElementById('handglove-no'),
      dateError: document.getElementById('date-error'),
      estimatedTotal: document.getElementById('estimated-total'),
      statusBanner: document.getElementById('status-banner'),
      checkoutForm: document.getElementById('checkout-form'),
      tableNumberSelect: document.getElementById('table-number'),
      tableError: document.getElementById('table-error'),
      ojolModeToggle: document.getElementById('ojol-mode-toggle'),
      ojolRefGroup: document.getElementById('ojol-ref-group'),
      ojolRefCodeInput: document.getElementById('ojol-ref-code'),
      ojolRefError: document.getElementById('ojol-ref-error'),
      customerNameInput: document.getElementById('customer-name'),
      nameError: document.getElementById('name-error'),
      groupNameInput: document.getElementById('group-name'),
      phoneInput: document.getElementById('customer-phone'),
      phoneError: document.getElementById('phone-error'),
      notesInput: document.getElementById('customer-notes'),
      submitOrderBtn: document.getElementById('submit-order-btn'),
      submitBtnText: document.getElementById('submit-btn-text'),
      reviewPanel: document.getElementById('review-panel'),
      reviewDetails: document.getElementById('review-details'),
      editOrderBtn: document.getElementById('edit-order-btn'),
      confirmSendOrderBtn: document.getElementById('confirm-send-order-btn'),
      whatsappLink: document.getElementById('whatsapp-link'),
      configWarning: document.getElementById('config-warning'),
      floatingOrderBar: document.getElementById('floating-order-bar'),
      floatingCartCount: document.getElementById('floating-cart-count'),
      floatingCartTotal: document.getElementById('floating-cart-total'),
      floatingOrderBtn: document.getElementById('floating-order-btn'),
      // Modal / Bottom Sheet Elements
      productModal: document.getElementById('product-modal'),
      modalBackdrop: document.getElementById('modal-backdrop'),
      modalCloseBtn: document.getElementById('modal-close-btn'),
      modalProductImg: document.getElementById('modal-product-img'),
      modalFavoriteBadge: document.getElementById('modal-favorite-badge'),
      modalProductCategory: document.getElementById('modal-product-category'),
      modalFavoriteTag: document.getElementById('modal-favorite-tag'),
      modalProductTitle: document.getElementById('modal-product-title'),
      modalProductSpec: document.getElementById('modal-product-spec'),
      modalProductDesc: document.getElementById('modal-product-desc'),
      modalProductOptions: document.getElementById('modal-product-options'),
      modalProductPrice: document.getElementById('modal-product-price'),
      modalAddBtn: document.getElementById('modal-add-btn'),
      // Success Modal Elements
      orderSuccessModal: document.getElementById('order-success-modal'),
      successModalBackdrop: document.getElementById('success-modal-backdrop'),
      closeSuccessModalBtn: document.getElementById('close-success-modal-btn'),
      successTableNumber: document.getElementById('success-table-number'),
      successAddonRow: document.getElementById('success-addon-row'),
      successOjolRow: document.getElementById('success-ojol-row'),
      successOjolRef: document.getElementById('success-ojol-ref'),
      successTotalPrice: document.getElementById('success-total-price'),
      successOrderId: document.getElementById('success-order-id')
    };

    let currentModalProduct = null;
    let modalPackageState = null;
    let modalSelectedSugar = 'Normal Sugar';

    function announceStatus(message) {
      if (elements.statusBanner) {
        elements.statusBanner.textContent = message;
      }
    }

    function invalidateReview() {
      if (state.isReviewed) {
        state.isReviewed = false;
        if (elements.reviewPanel) elements.reviewPanel.hidden = true;
      }
    }

    function persistState() {
      if (typeof saveCartDraft === 'function') {
        const ok = saveCartDraft(
          state.items,
          state.reservationDate,
          state.serviceType,
          state.reservationTime,
          state.needHandGlove,
          state.takeawayMethod,
          state.tableNumber,
          state.isOjol,
          state.ojolRefCode
        );
        if (!ok && !state.storageWarning) {
          state.storageWarning = true;
          announceStatus('Keranjang dapat digunakan, tetapi belum bisa disimpan pada browser ini.');
        }
      }
    }

    function getSubCategoriesForTab(tab) {
      if (tab === 'makanan') {
        return [
          'Semua Makanan',
          'Hidangan Gurame',
          'Ayam & Daging',
          'Seafood & Ikan',
          'Sayur & Kuah',
          'Tumisan Tradisional',
          'Pepes & Ikan Asin',
          'Aneka Nasi & Gorengan'
        ];
      } else if (tab === 'berlima') {
        return ['Semua Paket Berlima'];
      } else if (tab === 'minuman') {
        return ['Semua Minuman', 'Jus Buah Segar', 'Es & Jeruk Segar', 'Teh & Kopi'];
      } else if (tab === 'sambal') {
        return ['Semua Sambal'];
      }
      return ['Semua'];
    }

    function renderTabs() {
      if (!elements.catalogTabs) return;
      elements.catalogTabs.textContent = '';

      MAIN_TABS.forEach((tab) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tab-btn' + (state.activeTab === tab.id ? ' is-active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(state.activeTab === tab.id));
        btn.innerHTML = `<span class="tab-label">${tab.label}</span><span class="tab-desc">${tab.desc}</span>`;
        btn.addEventListener('click', () => {
          state.activeTab = tab.id;
          state.selectedCategory = 'Semua';
          renderTabs();
          renderCategories();
          renderCatalog();
        });
        elements.catalogTabs.appendChild(btn);
      });
    }

    function renderCategories() {
      if (!elements.categoryFilters) return;
      elements.categoryFilters.textContent = '';

      const subCats = getSubCategoriesForTab(state.activeTab);
      subCats.forEach((cat) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-chip';
        const isAll = cat.startsWith('Semua');
        const isActive = isAll
          ? state.selectedCategory === 'Semua' || state.selectedCategory === cat
          : state.selectedCategory === cat;
        if (isActive) btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', String(isActive));
        btn.textContent = cat;
        btn.addEventListener('click', () => {
          state.selectedCategory = isAll ? 'Semua' : cat;
          renderCategories();
          renderCatalog();
        });
        elements.categoryFilters.appendChild(btn);
      });
    }

    function getFilteredProducts() {
      const query = state.searchQuery.trim().toLowerCase();

      const filtered = PRODUCTS.filter((product) => {
        const pType = product.type || (
          (product.posCategory === 'Minuman' || (product.category || '').toLowerCase().includes('minum'))
            ? 'drink'
            : ((product.posCategory === 'Sambal' || (product.category || '').toLowerCase().includes('sambal'))
              ? 'sambal'
              : ((product.posCategory === 'Paket' || (product.category || '').toLowerCase().includes('berlima'))
                ? 'package'
                : 'food'))
        );

        // Tab Filtering
        let matchesTab = false;
        if (state.activeTab === 'berlima') {
          matchesTab = pType === 'package';
        } else if (state.activeTab === 'minuman') {
          matchesTab = pType === 'drink';
        } else if (state.activeTab === 'sambal') {
          matchesTab = pType === 'sambal';
        } else {
          // 'makanan' tab: includes all food
          matchesTab = pType === 'food';
        }

        // Subcategory Filtering
        let matchesCategory = true;
        if (state.selectedCategory !== 'Semua' && !state.selectedCategory.startsWith('Semua')) {
          if (state.activeTab === 'minuman') {
            if (state.selectedCategory === 'Jus Buah Segar') {
              matchesCategory = (product.name || '').toLowerCase().includes('jus');
            } else if (state.selectedCategory === 'Es & Jeruk Segar') {
              matchesCategory =
                (product.name || '').toLowerCase().includes('es') ||
                (product.name || '').toLowerCase().includes('jeruk');
            } else if (state.selectedCategory === 'Teh & Kopi') {
              matchesCategory =
                (product.name || '').toLowerCase().includes('teh') ||
                (product.name || '').toLowerCase().includes('kopi') ||
                (product.name || '').toLowerCase().includes('mineral');
            }
          } else {
            matchesCategory =
              product.category === state.selectedCategory ||
              product.posCategory === state.selectedCategory;
          }
        }

        // Search Query Filtering
        const matchesSearch =
          !query ||
          (product.name || '').toLowerCase().includes(query) ||
          (product.description || '').toLowerCase().includes(query) ||
          (product.category || '').toLowerCase().includes(query) ||
          (product.posCategory || '').toLowerCase().includes(query);

        return matchesTab && matchesCategory && matchesSearch;
      });

      // WAJIB URUT SECARA ALFABETIS A - Z
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));

      return filtered;
    }

    function syncCatalogAddButtons() {
      if (!elements.catalogGrid) return;
      const buttons = elements.catalogGrid.querySelectorAll('.btn-add-cart');
      buttons.forEach((btn) => {
        const pid = btn.getAttribute('data-product-id');
        if (!pid) return;
        const inCartItems = (state.items || []).filter((it) => it.productId === pid);
        const count = inCartItems.reduce((acc, it) => acc + it.quantity, 0);
        if (count > 0) {
          btn.classList.add('is-added');
          btn.innerHTML = `<span class="btn-check" aria-hidden="true">✓</span> Ditambah (${count})`;
        } else {
          btn.classList.remove('is-added');
          btn.textContent = '+ Tambah';
        }
      });
    }

    function openProductModal(product) {
      if (!elements.productModal) return;
      currentModalProduct = product;

      elements.modalProductImg.src = product.image;
      elements.modalProductImg.alt = product.name;
      elements.modalProductImg.onerror = () => {
        elements.modalProductImg.src = 'assets/images/logokecil.jpeg';
      };

      if (product.isBestSeller) {
        if (elements.modalFavoriteBadge) elements.modalFavoriteBadge.hidden = false;
        if (elements.modalFavoriteTag) elements.modalFavoriteTag.hidden = false;
      } else {
        if (elements.modalFavoriteBadge) elements.modalFavoriteBadge.hidden = true;
        if (elements.modalFavoriteTag) elements.modalFavoriteTag.hidden = true;
      }

      elements.modalProductCategory.textContent = product.category;
      elements.modalProductTitle.textContent = product.name;
      elements.modalProductSpec.textContent = `Porsi: ${product.specification}`;
      elements.modalProductDesc.textContent = product.description;

      // Reset Modal Options
      elements.modalProductOptions.innerHTML = '';
      modalSelectedSugar = 'Normal Sugar';
      modalPackageState = null;

      let modalPrice = state.isOjol ? Math.round(product.dailyPrice * 1.2) : product.dailyPrice;

      // Sugar Selector if applicable
      if (product.hasSugarOption) {
        const sugarBox = document.createElement('div');
        sugarBox.className = 'sugar-control-box';

        const sLabel = document.createElement('span');
        sLabel.className = 'sugar-label';
        sLabel.textContent = 'Pilihan Gula:';

        const sGroup = document.createElement('div');
        sGroup.className = 'sugar-btn-group';

        const nBtn = document.createElement('button');
        nBtn.type = 'button';
        nBtn.className = 'sugar-btn is-active';
        nBtn.textContent = 'Normal';

        const lBtn = document.createElement('button');
        lBtn.type = 'button';
        lBtn.className = 'sugar-btn';
        lBtn.textContent = 'Less Sugar';

        nBtn.addEventListener('click', () => {
          modalSelectedSugar = 'Normal Sugar';
          nBtn.classList.add('is-active');
          lBtn.classList.remove('is-active');
        });

        lBtn.addEventListener('click', () => {
          modalSelectedSugar = 'Less Sugar';
          lBtn.classList.add('is-active');
          nBtn.classList.remove('is-active');
        });

        sGroup.append(nBtn, lBtn);
        sugarBox.append(sLabel, sGroup);
        elements.modalProductOptions.appendChild(sugarBox);
      }

      // Package Customizer if applicable
      if (product.hasPackageCustomization && product.packageConfig) {
        modalPackageState = {
          gurame:
            product.packageConfig && product.packageConfig.gurameChoices
              ? product.packageConfig.gurameChoices[0]
              : '',
          ayam:
            product.packageConfig && product.packageConfig.ayamChoices
              ? product.packageConfig.ayamChoices[0]
              : '',
          bakwan:
            product.packageConfig && product.packageConfig.bakwanChoices
              ? product.packageConfig.bakwanChoices[0]
              : '',
          tumisan:
            product.packageConfig && product.packageConfig.tumisanChoices
              ? product.packageConfig.tumisanChoices[0]
              : '',
          nasi: 'Nasi Putih Bakul',
          isLiwet: false
        };

        const customizerBox = document.createElement('div');
        customizerBox.className = 'package-customizer';

        // 1. Gurame
        if (product.packageConfig.hasGurame && product.packageConfig.gurameChoices) {
          const grp = document.createElement('div');
          grp.className = 'custom-select-group';
          const lbl = document.createElement('label');
          lbl.className = 'custom-select-label';
          lbl.textContent = 'Pilihan Olahan Gurame:';
          const sel = document.createElement('select');
          sel.className = 'custom-select';
          product.packageConfig.gurameChoices.forEach((choice) => {
            const opt = document.createElement('option');
            opt.value = choice;
            opt.textContent = choice;
            sel.appendChild(opt);
          });
          sel.addEventListener('change', () => {
            modalPackageState.gurame = sel.value;
          });
          grp.append(lbl, sel);
          customizerBox.appendChild(grp);
        }

        // 2. Ayam
        if (product.packageConfig.hasAyam && product.packageConfig.ayamChoices) {
          const grp = document.createElement('div');
          grp.className = 'custom-select-group';
          const lbl = document.createElement('label');
          lbl.className = 'custom-select-label';
          lbl.textContent = 'Pilihan Olahan Ayam:';
          const sel = document.createElement('select');
          sel.className = 'custom-select';
          product.packageConfig.ayamChoices.forEach((choice) => {
            const opt = document.createElement('option');
            opt.value = choice;
            opt.textContent = choice;
            sel.appendChild(opt);
          });
          sel.addEventListener('change', () => {
            modalPackageState.ayam = sel.value;
          });
          grp.append(lbl, sel);
          customizerBox.appendChild(grp);
        }

        // 3. Bakwan
        if (product.packageConfig.bakwanChoices) {
          const grp = document.createElement('div');
          grp.className = 'custom-select-group';
          const lbl = document.createElement('label');
          lbl.className = 'custom-select-label';
          lbl.textContent = 'Pilihan Gorengan (5 pcs):';
          const sel = document.createElement('select');
          sel.className = 'custom-select';
          product.packageConfig.bakwanChoices.forEach((choice) => {
            const opt = document.createElement('option');
            opt.value = choice;
            opt.textContent = choice;
            sel.appendChild(opt);
          });
          sel.addEventListener('change', () => {
            modalPackageState.bakwan = sel.value;
          });
          grp.append(lbl, sel);
          customizerBox.appendChild(grp);
        }

        // 4. Tumisan
        if (product.packageConfig.tumisanChoices) {
          const grp = document.createElement('div');
          grp.className = 'custom-select-group';
          const lbl = document.createElement('label');
          lbl.className = 'custom-select-label';
          lbl.textContent = 'Pilihan Sayur Tumisan:';
          const sel = document.createElement('select');
          sel.className = 'custom-select';
          product.packageConfig.tumisanChoices.forEach((choice) => {
            const opt = document.createElement('option');
            opt.value = choice;
            opt.textContent = choice;
            sel.appendChild(opt);
          });
          sel.addEventListener('change', () => {
            modalPackageState.tumisan = sel.value;
          });
          grp.append(lbl, sel);
          customizerBox.appendChild(grp);
        }

        // 5. Nasi Bakul
        const grpNasi = document.createElement('div');
        grpNasi.className = 'custom-select-group';
        const lblNasi = document.createElement('label');
        lblNasi.className = 'custom-select-label';
        lblNasi.textContent = 'Pilihan Nasi Bakul:';
        const selNasi = document.createElement('select');
        selNasi.className = 'custom-select custom-select-nasi';

        const optNasiPutih = document.createElement('option');
        optNasiPutih.value = 'Nasi Putih Bakul';
        optNasiPutih.textContent = 'Nasi Putih Bakul (Default)';

        const optNasiLiwet = document.createElement('option');
        optNasiLiwet.value = 'Nasi Liwet Bakul';
        optNasiLiwet.textContent = 'Ganti Nasi Liwet Bakul (+Rp 10.000)';

        selNasi.append(optNasiPutih, optNasiLiwet);

        selNasi.addEventListener('change', () => {
          modalPackageState.nasi = selNasi.value;
          modalPackageState.isLiwet = selNasi.value === 'Nasi Liwet Bakul';
          const baseCurrentPrice = modalPackageState.isLiwet
            ? product.dailyPrice + (product.packageConfig.nasiUpgradePrice || 10000)
            : product.dailyPrice;
          const currentPrice = state.isOjol ? Math.round(baseCurrentPrice * 1.2) : baseCurrentPrice;
          elements.modalProductPrice.textContent = formatRupiah(currentPrice);
        });

        grpNasi.append(lblNasi, selNasi);
        customizerBox.appendChild(grpNasi);
        elements.modalProductOptions.appendChild(customizerBox);
      }

      elements.modalProductPrice.textContent = formatRupiah(modalPrice);
      elements.modalAddBtn.textContent = '+ Tambah ke Pesanan';
      elements.modalAddBtn.classList.remove('is-added');

      elements.productModal.hidden = false;
      document.body.classList.add('modal-open');
    }

    function closeProductModal() {
      if (!elements.productModal) return;
      elements.productModal.hidden = true;
      document.body.classList.remove('modal-open');
      currentModalProduct = null;
    }

    function renderCatalog() {
      if (!elements.catalogGrid || !elements.catalogCount) return;
      const filtered = getFilteredProducts();
      elements.catalogCount.textContent = `Menampilkan ${filtered.length} menu pada kategori ini`;
      elements.catalogGrid.textContent = '';

      if (filtered.length === 0) {
        if (elements.emptyCatalogState) elements.emptyCatalogState.hidden = false;
        return;
      }

      if (elements.emptyCatalogState) elements.emptyCatalogState.hidden = true;

      filtered.forEach((product) => {
        const card = document.createElement('article');
        card.className =
          'product-card' + (product.type === 'package' ? ' product-card-featured' : '');

        // Click on card to open detail modal (like GoFood)
        card.addEventListener('click', (e) => {
          if (
            e.target.closest('.btn-add-cart') ||
            e.target.closest('.sugar-btn') ||
            e.target.closest('.custom-select') ||
            e.target.closest('select') ||
            e.target.closest('button')
          ) {
            return;
          }
          openProductModal(product);
        });

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'product-img-wrapper';

        const img = document.createElement('img');
        img.src = product.image;
        img.alt = product.imageAlt || product.name;
        img.width = 400;
        img.height = 280;
        img.loading = 'lazy';
        img.className = 'product-image';
        img.addEventListener('error', () => {
          img.src = 'assets/images/logokecil.jpeg';
        });

        imgWrapper.appendChild(img);

        // Prominent Best Seller Badge on Image
        if (product.isBestSeller) {
          const badgeBest = document.createElement('span');
          badgeBest.className = 'badge-bestseller';
          badgeBest.innerHTML = '🔥 MENU FAVORIT';
          imgWrapper.appendChild(badgeBest);
        }

        const body = document.createElement('div');
        body.className = 'product-body';

        // Badges Row (Super Obvious Favorite Label!)
        const badgesRow = document.createElement('div');
        badgesRow.className = 'product-badges-row';

        if (product.isBestSeller) {
          const badgeFav = document.createElement('span');
          badgeFav.className = 'badge-favorite-label';
          badgeFav.innerHTML = '🔥 MENU FAVORIT';
          badgesRow.appendChild(badgeFav);
        }

        const badge = document.createElement('span');
        badge.className = 'product-category';
        badge.textContent = product.category;
        badgesRow.appendChild(badge);

        const title = document.createElement('h3');
        title.className = 'product-title';
        title.textContent = product.name;

        const desc = document.createElement('p');
        desc.className = 'product-desc';
        desc.textContent = product.description;

        const spec = document.createElement('p');
        spec.className = 'product-spec';
        spec.textContent = `Porsi: ${product.specification}`;

        body.append(badgesRow, title, desc, spec);

        // Sugar Option for Drinks
        let selectedSugar = 'Normal Sugar';
        if (product.hasSugarOption) {
          const sugarBox = document.createElement('div');
          sugarBox.className = 'sugar-control-box';

          const sugarLabel = document.createElement('span');
          sugarLabel.className = 'sugar-label';
          sugarLabel.textContent = 'Pilihan Gula:';

          const sugarGroup = document.createElement('div');
          sugarGroup.className = 'sugar-btn-group';

          const normalBtn = document.createElement('button');
          normalBtn.type = 'button';
          normalBtn.className = 'sugar-btn is-active';
          normalBtn.textContent = 'Normal';

          const lessBtn = document.createElement('button');
          lessBtn.type = 'button';
          lessBtn.className = 'sugar-btn';
          lessBtn.textContent = 'Less Sugar';

          normalBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedSugar = 'Normal Sugar';
            normalBtn.classList.add('is-active');
            lessBtn.classList.remove('is-active');
          });

          lessBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedSugar = 'Less Sugar';
            lessBtn.classList.add('is-active');
            normalBtn.classList.remove('is-active');
          });

          sugarGroup.append(normalBtn, lessBtn);
          sugarBox.append(sugarLabel, sugarGroup);
          body.appendChild(sugarBox);
        }

        // Package Customization for Paket Hemat Berlima
        const packageState = {
          gurame:
            product.packageConfig && product.packageConfig.gurameChoices
              ? product.packageConfig.gurameChoices[0]
              : '',
          ayam:
            product.packageConfig && product.packageConfig.ayamChoices
              ? product.packageConfig.ayamChoices[0]
              : '',
          bakwan:
            product.packageConfig && product.packageConfig.bakwanChoices
              ? product.packageConfig.bakwanChoices[0]
              : '',
          tumisan:
            product.packageConfig && product.packageConfig.tumisanChoices
              ? product.packageConfig.tumisanChoices[0]
              : '',
          nasi: 'Nasi Putih Bakul',
          isLiwet: false
        };

        const footer = document.createElement('div');
        footer.className = 'product-footer';

        const price = document.createElement('strong');
        price.className = 'product-price';
        const cardDisplayPrice = state.isOjol ? Math.round(product.dailyPrice * 1.2) : product.dailyPrice;
        price.textContent = `${formatRupiah(cardDisplayPrice)}`;

        if (product.hasPackageCustomization && product.packageConfig) {
          const customizerBox = document.createElement('div');
          customizerBox.className = 'package-customizer';

          // 1. Pilihan Gurame if applicable
          if (product.packageConfig.hasGurame && product.packageConfig.gurameChoices) {
            const grp = document.createElement('div');
            grp.className = 'custom-select-group';
            const lbl = document.createElement('label');
            lbl.className = 'custom-select-label';
            lbl.textContent = 'Pilihan Olahan Gurame:';
            const sel = document.createElement('select');
            sel.className = 'custom-select';
            product.packageConfig.gurameChoices.forEach((choice) => {
              const opt = document.createElement('option');
              opt.value = choice;
              opt.textContent = choice;
              sel.appendChild(opt);
            });
            sel.addEventListener('change', (e) => {
              e.stopPropagation();
              packageState.gurame = sel.value;
            });
            grp.append(lbl, sel);
            customizerBox.appendChild(grp);
          }

          // 2. Pilihan Ayam if applicable
          if (product.packageConfig.hasAyam && product.packageConfig.ayamChoices) {
            const grp = document.createElement('div');
            grp.className = 'custom-select-group';
            const lbl = document.createElement('label');
            lbl.className = 'custom-select-label';
            lbl.textContent = 'Pilihan Olahan Ayam:';
            const sel = document.createElement('select');
            sel.className = 'custom-select';
            product.packageConfig.ayamChoices.forEach((choice) => {
              const opt = document.createElement('option');
              opt.value = choice;
              opt.textContent = choice;
              sel.appendChild(opt);
            });
            sel.addEventListener('change', (e) => {
              e.stopPropagation();
              packageState.ayam = sel.value;
            });
            grp.append(lbl, sel);
            customizerBox.appendChild(grp);
          }

          // 3. Pilihan Bakwan / Gorengan
          if (product.packageConfig.bakwanChoices) {
            const grp = document.createElement('div');
            grp.className = 'custom-select-group';
            const lbl = document.createElement('label');
            lbl.className = 'custom-select-label';
            lbl.textContent = 'Pilihan Gorengan (5 pcs):';
            const sel = document.createElement('select');
            sel.className = 'custom-select';
            product.packageConfig.bakwanChoices.forEach((choice) => {
              const opt = document.createElement('option');
              opt.value = choice;
              opt.textContent = choice;
              sel.appendChild(opt);
            });
            sel.addEventListener('change', (e) => {
              e.stopPropagation();
              packageState.bakwan = sel.value;
            });
            grp.append(lbl, sel);
            customizerBox.appendChild(grp);
          }

          // 4. Pilihan Tumisan
          if (product.packageConfig.tumisanChoices) {
            const grp = document.createElement('div');
            grp.className = 'custom-select-group';
            const lbl = document.createElement('label');
            lbl.className = 'custom-select-label';
            lbl.textContent = 'Pilihan Sayur Tumisan:';
            const sel = document.createElement('select');
            sel.className = 'custom-select';
            product.packageConfig.tumisanChoices.forEach((choice) => {
              const opt = document.createElement('option');
              opt.value = choice;
              opt.textContent = choice;
              sel.appendChild(opt);
            });
            sel.addEventListener('change', (e) => {
              e.stopPropagation();
              packageState.tumisan = sel.value;
            });
            grp.append(lbl, sel);
            customizerBox.appendChild(grp);
          }

          // 5. Pilihan Nasi Bakul
          const grpNasi = document.createElement('div');
          grpNasi.className = 'custom-select-group';
          const lblNasi = document.createElement('label');
          lblNasi.className = 'custom-select-label';
          lblNasi.textContent = 'Pilihan Nasi Bakul:';
          const selNasi = document.createElement('select');
          selNasi.className = 'custom-select custom-select-nasi';

          const optNasiPutih = document.createElement('option');
          optNasiPutih.value = 'Nasi Putih Bakul';
          optNasiPutih.textContent = 'Nasi Putih Bakul (Default)';

          const optNasiLiwet = document.createElement('option');
          optNasiLiwet.value = 'Nasi Liwet Bakul';
          optNasiLiwet.textContent = 'Ganti Nasi Liwet Bakul (+Rp 10.000)';

          selNasi.append(optNasiPutih, optNasiLiwet);

          selNasi.addEventListener('change', (e) => {
            e.stopPropagation();
            packageState.nasi = selNasi.value;
            packageState.isLiwet = selNasi.value === 'Nasi Liwet Bakul';
            const currentPrice = packageState.isLiwet
              ? product.dailyPrice + (product.packageConfig.nasiUpgradePrice || 10000)
              : product.dailyPrice;
            const displayPrice = state.isOjol ? Math.round(currentPrice * 1.2) : currentPrice;
            price.textContent = `${formatRupiah(displayPrice)}`;
          });

          grpNasi.append(lblNasi, selNasi);
          customizerBox.appendChild(grpNasi);

          body.appendChild(customizerBox);
        }

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-primary btn-add-cart';
        addBtn.setAttribute('data-product-id', product.id);
        addBtn.setAttribute('aria-label', `Tambah ${product.name} ke keranjang`);

        const inCartItems = (state.items || []).filter((it) => it.productId === product.id);
        const countInCart = inCartItems.reduce((acc, it) => acc + it.quantity, 0);
        if (countInCart > 0) {
          addBtn.classList.add('is-added');
          addBtn.innerHTML = `<span class="btn-check" aria-hidden="true">✓</span> Ditambah (${countInCart})`;
        } else {
          addBtn.classList.remove('is-added');
          addBtn.textContent = '+ Tambah';
        }

        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          let opt = '';
          let customPrice = null;

          if (product.hasSugarOption) {
            opt = selectedSugar;
          } else if (product.hasPackageCustomization && product.packageConfig) {
            const parts = [];
            if (product.packageConfig.hasGurame && packageState.gurame) {
              parts.push(`Gurame: ${packageState.gurame}`);
            }
            if (product.packageConfig.hasAyam && packageState.ayam) {
              parts.push(`Ayam: ${packageState.ayam}`);
            }
            if (packageState.bakwan) {
              parts.push(`Bakwan: ${packageState.bakwan}`);
            }
            if (packageState.tumisan) {
              parts.push(`Tumis: ${packageState.tumisan}`);
            }
            parts.push(
              `Nasi: ${packageState.nasi}${packageState.isLiwet ? ' (+Rp 10.000)' : ''}`
            );
            opt = parts.join(' | ');

            if (packageState.isLiwet) {
              customPrice =
                product.dailyPrice + (product.packageConfig.nasiUpgradePrice || 10000);
            }
          }

          state.items = addOrIncrementItem(state.items, product.id, 1, opt, customPrice);

          // Visual tactile feedback: turns white with checkmark
          addBtn.classList.add('is-added');
          const updatedItems = (state.items || []).filter((it) => it.productId === product.id);
          const updatedCount = updatedItems.reduce((acc, it) => acc + it.quantity, 0);
          addBtn.innerHTML = `<span class="btn-check" aria-hidden="true">✓</span> Ditambah (${updatedCount})`;

          invalidateReview();
          persistState();
          renderCart();
          const optText = opt ? ` (${opt})` : '';
          announceStatus(`${product.name}${optText} ditambahkan ke daftar pesanan.`);
        });

        footer.append(price, addBtn);
        body.appendChild(footer);
        card.append(imgWrapper, body);
        elements.catalogGrid.appendChild(card);
      });
    }

    function renderCart() {
      if (!elements.cartItemsContainer || !elements.cartJumpCount) return;
      const summary = calculateCartSummary(
        state.items,
        PRODUCTS,
        state.reservationDate,
        state.isOjol
      );
      elements.cartJumpCount.textContent = String(summary.totalUnits);
      elements.cartItemsContainer.textContent = '';

      // Update Floating Shortcut Bar
      if (elements.floatingCartCount && elements.floatingCartTotal) {
        elements.floatingCartCount.textContent =
          summary.totalUnits > 0 ? `${summary.totalUnits} Menu` : '0 Menu';
        elements.floatingCartTotal.textContent =
          summary.rawTotalPrice > 0 ? formatRupiah(summary.rawTotalPrice) : 'Rp 0';

        if (elements.floatingOrderBar) {
          if (summary.totalUnits > 0) {
            elements.floatingOrderBar.classList.add('has-items');
          } else {
            elements.floatingOrderBar.classList.remove('has-items');
          }
        }
      }

      // Sync button states on catalog
      syncCatalogAddButtons();

      if (summary.items.length === 0) {
        if (elements.emptyCartMessage) elements.emptyCartMessage.hidden = false;
      } else {
        if (elements.emptyCartMessage) elements.emptyCartMessage.hidden = true;
        summary.items.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'cart-row';

          const info = document.createElement('div');
          info.className = 'cart-item-info';

          const title = document.createElement('strong');
          title.textContent = item.name;

          if (item.option) {
            const optSpan = document.createElement('span');
            optSpan.className = 'cart-option-badge';
            optSpan.textContent = ` [${item.option}]`;
            title.appendChild(optSpan);
          }

          const meta = document.createElement('span');
          meta.className = 'cart-item-meta';
          meta.textContent = `${formatRupiah(item.unitPrice)} / porsi • Subtotal: ${formatRupiah(
            item.subtotal
          )}`;

          info.append(title, meta);

          const controls = document.createElement('div');
          controls.className = 'cart-controls';

          const decBtn = document.createElement('button');
          decBtn.type = 'button';
          decBtn.className = 'btn-qty';
          decBtn.setAttribute('aria-label', `Kurangi porsi ${item.name}`);
          decBtn.textContent = '−';
          decBtn.addEventListener('click', () => {
            if (item.quantity > 1) {
              const res = updateItemQuantity(
                state.items,
                item.productId,
                item.quantity - 1,
                item.option
              );
              state.items = res.items;
              invalidateReview();
              persistState();
              renderCart();
            }
          });

          const qtyInput = document.createElement('input');
          qtyInput.type = 'number';
          qtyInput.min = '1';
          qtyInput.max = '99';
          qtyInput.value = String(item.quantity);
          qtyInput.className = 'qty-input';
          qtyInput.setAttribute('aria-label', `Jumlah porsi ${item.name}`);
          qtyInput.addEventListener('change', () => {
            const res = updateItemQuantity(
              state.items,
              item.productId,
              Number(qtyInput.value),
              item.option
            );
            if (!res.valid) {
              qtyInput.value = String(item.quantity);
              announceStatus('Jumlah porsi harus berupa angka bulat antara 1 sampai 99.');
              return;
            }
            state.items = res.items;
            invalidateReview();
            persistState();
            renderCart();
          });

          const incBtn = document.createElement('button');
          incBtn.type = 'button';
          incBtn.className = 'btn-qty';
          incBtn.setAttribute('aria-label', `Tambah porsi ${item.name}`);
          incBtn.textContent = '+';
          incBtn.addEventListener('click', () => {
            const res = updateItemQuantity(
              state.items,
              item.productId,
              item.quantity + 1,
              item.option
            );
            if (!res.valid) {
              announceStatus('Batas maksimum pemesanan per menu di website adalah 99 porsi.');
              return;
            }
            state.items = res.items;
            invalidateReview();
            persistState();
            renderCart();
          });

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'btn-remove';
          removeBtn.textContent = 'Hapus';
          removeBtn.addEventListener('click', () => {
            state.items = removeItem(state.items, item.productId, item.option);
            invalidateReview();
            persistState();
            renderCart();
            announceStatus(`${item.name} dihapus dari daftar pesanan.`);
          });

          controls.append(decBtn, qtyInput, incBtn, removeBtn);
          row.append(info, controls);
          elements.cartItemsContainer.appendChild(row);
        });
      }

      if (elements.estimatedTotal) {
        if (!state.reservationDate) {
          elements.estimatedTotal.textContent =
            'Pilih tanggal kedatangan untuk menghitung total estimasi';
        } else if (!summary.dateValid) {
          elements.estimatedTotal.textContent = summary.dateMessage;
        } else {
          elements.estimatedTotal.textContent = formatRupiah(summary.totalPrice);
        }
      }
    }

    function setFieldError(inputEl, errorEl, message) {
      if (!inputEl || !errorEl) return;
      if (message) {
        inputEl.setAttribute('aria-invalid', 'true');
        errorEl.textContent = message;
        errorEl.hidden = false;
      } else {
        inputEl.removeAttribute('aria-invalid');
        errorEl.textContent = '';
        errorEl.hidden = true;
      }
    }

    function updateServiceTypeUI() {
      const isDineIn = state.serviceType === 'dine-in';
      if (elements.guestCountGroup) {
        elements.guestCountGroup.style.display = isDineIn ? 'block' : 'none';
      }
      if (elements.takeawayMethodGroup) {
        elements.takeawayMethodGroup.style.display = isDineIn ? 'none' : 'block';
      }
      if (elements.gosendNotice) {
        elements.gosendNotice.style.display =
          !isDineIn && state.takeawayMethod === 'gosend' ? 'block' : 'none';
      }
      if (elements.handgloveGroup) {
        elements.handgloveGroup.style.display = isDineIn ? 'none' : 'block';
      }
      const timeLabel = document.getElementById('time-label');
      if (timeLabel) {
        timeLabel.textContent = isDineIn
          ? 'Jam Rencana Kedatangan'
          : 'Jam Rencana Pengambilan (Bungkus)';
      }
    }

    async function processAndSendOrder(summary, sanitizedContact) {
      if (!summary || summary.items.length === 0) {
        announceStatus('Keranjang pesanan masih kosong. Pilih minimal 1 menu terlebih dahulu.');
        return;
      }

      // Tampilkan indikator loading pada tombol Kirim Pesanan
      if (elements.submitOrderBtn) {
        elements.submitOrderBtn.disabled = true;
      }
      if (elements.submitBtnText) {
        elements.submitBtnText.textContent = 'Mengirim ke Dapur...';
      }
      if (elements.confirmSendOrderBtn) {
        elements.confirmSendOrderBtn.disabled = true;
        elements.confirmSendOrderBtn.textContent = '⏳ Mengirim ke Dapur...';
      }

      try {
        const tableClean = String(sanitizedContact.tableNumber || (sanitizedContact.isOjol ? 'Take-Away' : 'Meja 1')).trim();
        const isTakeAway = tableClean.toLowerCase().includes('take-away') || Boolean(sanitizedContact.isOjol);
        const orderType = isTakeAway ? 'take_away' : 'dine_in';
        const isOjol = Boolean(sanitizedContact.isOjol);
        const kodeOjol = isOjol ? String(sanitizedContact.ojolRefCode || '') : '';

        const formattedItems = summary.items.map((i) => ({
          id: String(i.productId || 'menu-item'),
          name: String(i.name || 'Menu'),
          qty: Number(i.quantity || 1),
          price: Number(i.unitPrice || 0),
          subtotal: Number(i.subtotal || (i.quantity * i.unitPrice)),
          note: String(i.option || '').trim()
        }));

        const orderPayload = {
          nomorMeja: tableClean,
          orderType: orderType,
          isOjol: isOjol,
          kodeOjol: kodeOjol,
          items: formattedItems,
          totalHarga: Number(summary.totalPrice),
          kitchenStatus: 'baru',
          paymentStatus: 'belum_lunas',
          paymentMethod: '',
          customerName: sanitizedContact.customerName || '',
          phone: sanitizedContact.phone || '',
          notes: sanitizedContact.notes || '',
          serviceType: sanitizedContact.serviceType,
          reservationDate: state.reservationDate,
          reservationTime: sanitizedContact.reservationTime || ''
        };

        const result = await sendOrderToFirestore(orderPayload);

        // Tampilkan Modal Notifikasi Sukses
        if (elements.orderSuccessModal) {
          if (elements.successTableNumber) {
            elements.successTableNumber.textContent = orderPayload.nomorMeja;
          }
          if (elements.successAddonRow) {
            elements.successAddonRow.style.display = result.isAddon ? 'flex' : 'none';
          }
          if (elements.successOjolRow && elements.successOjolRef) {
            if (orderPayload.isOjol) {
              elements.successOjolRow.style.display = 'flex';
              elements.successOjolRef.textContent = orderPayload.kodeOjol || orderPayload.kodeReferensi || '-';
            } else {
              elements.successOjolRow.style.display = 'none';
            }
          }
          if (elements.successTotalPrice) {
            elements.successTotalPrice.textContent = formatRupiah(orderPayload.totalHarga);
          }
          if (elements.successOrderId) {
            elements.successOrderId.textContent = result.orderId || ('ORD-' + Date.now());
          }

          elements.orderSuccessModal.hidden = false;
          document.body.classList.add('modal-open');
        }

        // Reset keranjang belanja & form draf
        state.items = [];
        state.isReviewed = false;
        if (elements.reviewPanel) elements.reviewPanel.hidden = true;
        persistState();
        renderCart();
        renderCatalog();

        announceStatus('Pesanan berhasil dikirim ke dapur!');
      } catch (err) {
        console.error('Error pengiriman pesanan ke Firestore:', err);
        announceStatus('Gagal mengirim pesanan ke dapur: ' + (err.message || 'Kesalahan sistem'));
        alert('Gagal mengirim pesanan ke dapur. Pastikan perangkat Anda terhubung dengan internet dan coba lagi.');
      } finally {
        if (elements.submitOrderBtn) {
          elements.submitOrderBtn.disabled = false;
        }
        if (elements.submitBtnText) {
          elements.submitBtnText.textContent = 'Kirim Pesanan';
        }
        if (elements.confirmSendOrderBtn) {
          elements.confirmSendOrderBtn.disabled = false;
          elements.confirmSendOrderBtn.textContent = '🚀 Konfirmasi & Kirim Pesanan ke Dapur';
        }
      }
    }

    function closeSuccessModal() {
      if (!elements.orderSuccessModal) return;
      elements.orderSuccessModal.hidden = true;
      document.body.classList.remove('modal-open');
      const catalogSection = document.getElementById('katalog');
      if (catalogSection) {
        catalogSection.scrollIntoView({ behavior: 'smooth' });
      }
    }

    function renderReviewSummary(summary, sanitizedContact) {
      if (!elements.reviewDetails) return;
      elements.reviewDetails.textContent = '';

      const list = document.createElement('dl');
      list.className = 'review-list';

      const entries = [
        ['Nomor Meja / Layanan', sanitizedContact.tableNumber],
        sanitizedContact.isOjol
          ? ['Mode Ojol', `Aktif (Markup +20%) - Ref: ${sanitizedContact.ojolRefCode}`]
          : null,
        ['Tipe Layanan', sanitizedContact.serviceLabel],
        ['Nama Pemesan', sanitizedContact.customerName],
        sanitizedContact.groupName && sanitizedContact.groupName !== '-'
          ? ['Instansi / Rombongan', sanitizedContact.groupName]
          : null,
        sanitizedContact.phone && sanitizedContact.phone !== '-'
          ? ['Nomor WhatsApp / HP', sanitizedContact.phone]
          : null,
        ['Tanggal Pesanan', state.reservationDate],
        ['Jam Kedatangan / Ambil', `${sanitizedContact.reservationTime} WIB`],
        sanitizedContact.serviceType === 'dine-in' && sanitizedContact.guestCount !== '-'
          ? ['Konfirmasi Jumlah Orang', `${sanitizedContact.guestCount} Orang`]
          : null,
        sanitizedContact.serviceType === 'take-away'
          ? ['Metode Pengambilan', sanitizedContact.takeawayMethodText]
          : null,
        sanitizedContact.serviceType === 'take-away'
          ? ['Sarung Tangan Plastik', sanitizedContact.handGloveText]
          : null,
        [
          'Rincian Menu',
          summary.items
            .map((i) => `${i.name}${i.option ? ` [${i.option}]` : ''} (${i.quantity}x @ ${formatRupiah(i.unitPrice)})`)
            .join(', ')
        ],
        ['Total Estimasi Biaya', formatRupiah(summary.totalPrice)],
        sanitizedContact.notes && sanitizedContact.notes !== '-'
          ? ['Catatan Khusus', sanitizedContact.notes]
          : null
      ].filter(Boolean);

      entries.forEach(([term, desc]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = desc;
        list.append(dt, dd);
      });

      elements.reviewDetails.appendChild(list);

      if (elements.confirmSendOrderBtn) {
        elements.confirmSendOrderBtn.onclick = () => {
          processAndSendOrder(summary, sanitizedContact);
        };
      }

      if (elements.reviewPanel) elements.reviewPanel.hidden = false;
      state.isReviewed = true;
    }

    function initEvents() {
      if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
          state.searchQuery = e.target.value;
          renderCatalog();
        });
      }

      if (elements.resetFilterBtn) {
        elements.resetFilterBtn.addEventListener('click', () => {
          state.searchQuery = '';
          state.selectedCategory = 'Semua';
          if (elements.searchInput) elements.searchInput.value = '';
          renderCategories();
          renderCatalog();
        });
      }

      if (elements.tableNumberSelect) {
        elements.tableNumberSelect.addEventListener('change', () => {
          state.tableNumber = elements.tableNumberSelect.value;
          setFieldError(elements.tableNumberSelect, elements.tableError, '');

          if (state.tableNumber === 'Take-Away (Bungkus)') {
            state.serviceType = 'take-away';
            if (elements.serviceTypeTakeAway) elements.serviceTypeTakeAway.checked = true;
          } else {
            state.serviceType = 'dine-in';
            if (elements.serviceTypeDineIn) elements.serviceTypeDineIn.checked = true;
          }

          updateServiceTypeUI();
          invalidateReview();
          persistState();
        });
      }

      if (elements.ojolModeToggle) {
        elements.ojolModeToggle.addEventListener('change', () => {
          state.isOjol = elements.ojolModeToggle.checked;

          if (state.isOjol) {
            if (elements.ojolRefGroup) elements.ojolRefGroup.style.display = 'block';
            state.serviceType = 'take-away';
            if (elements.serviceTypeTakeAway) elements.serviceTypeTakeAway.checked = true;
            if (elements.tableNumberSelect) {
              elements.tableNumberSelect.value = 'Take-Away (Bungkus)';
              state.tableNumber = 'Take-Away (Bungkus)';
              setFieldError(elements.tableNumberSelect, elements.tableError, '');
            }
            announceStatus('Mode Ojol aktif. Markup komisi +20% diterapkan ke semua harga.');
          } else {
            if (elements.ojolRefGroup) elements.ojolRefGroup.style.display = 'none';
            if (elements.ojolRefCodeInput) elements.ojolRefCodeInput.value = '';
            state.ojolRefCode = '';
            setFieldError(elements.ojolRefCodeInput, elements.ojolRefError, '');
            announceStatus('Mode Ojol dinonaktifkan. Harga normal Saung H. Amir kembali diterapkan.');
          }

          updateServiceTypeUI();
          renderCatalog();
          renderCart();
          invalidateReview();
          persistState();
        });
      }

      if (elements.ojolRefCodeInput) {
        elements.ojolRefCodeInput.addEventListener('input', () => {
          state.ojolRefCode = elements.ojolRefCodeInput.value;
          setFieldError(elements.ojolRefCodeInput, elements.ojolRefError, '');
          invalidateReview();
          persistState();
        });
      }

      if (elements.closeSuccessModalBtn) {
        elements.closeSuccessModalBtn.addEventListener('click', closeSuccessModal);
      }
      if (elements.successModalBackdrop) {
        elements.successModalBackdrop.addEventListener('click', closeSuccessModal);
      }

      if (elements.serviceTypeDineIn) {
        elements.serviceTypeDineIn.addEventListener('change', () => {
          if (elements.serviceTypeDineIn.checked) {
            state.serviceType = 'dine-in';
            if (elements.tableNumberSelect && elements.tableNumberSelect.value === 'Take-Away (Bungkus)') {
              elements.tableNumberSelect.value = 'Meja 1';
              state.tableNumber = 'Meja 1';
            }
            if (elements.ojolModeToggle && elements.ojolModeToggle.checked) {
              elements.ojolModeToggle.checked = false;
              state.isOjol = false;
              if (elements.ojolRefGroup) elements.ojolRefGroup.style.display = 'none';
              renderCatalog();
              renderCart();
            }
            updateServiceTypeUI();
            invalidateReview();
            persistState();
          }
        });
      }

      if (elements.serviceTypeTakeAway) {
        elements.serviceTypeTakeAway.addEventListener('change', () => {
          if (elements.serviceTypeTakeAway.checked) {
            state.serviceType = 'take-away';
            if (elements.tableNumberSelect) {
              elements.tableNumberSelect.value = 'Take-Away (Bungkus)';
              state.tableNumber = 'Take-Away (Bungkus)';
              setFieldError(elements.tableNumberSelect, elements.tableError, '');
            }
            updateServiceTypeUI();
            invalidateReview();
            persistState();
          }
        });
      }

      if (elements.takeawaySelf) {
        elements.takeawaySelf.addEventListener('change', () => {
          if (elements.takeawaySelf.checked) {
            state.takeawayMethod = 'self-pickup';
            if (elements.gosendNotice) elements.gosendNotice.style.display = 'none';
            invalidateReview();
            persistState();
          }
        });
      }

      if (elements.takeawayGosend) {
        elements.takeawayGosend.addEventListener('change', () => {
          if (elements.takeawayGosend.checked) {
            state.takeawayMethod = 'gosend';
            if (elements.gosendNotice) elements.gosendNotice.style.display = 'block';
            invalidateReview();
            persistState();
          }
        });
      }

      if (elements.handgloveYes) {
        elements.handgloveYes.addEventListener('change', () => {
          if (elements.handgloveYes.checked) {
            state.needHandGlove = true;
            invalidateReview();
            persistState();
          }
        });
      }

      if (elements.handgloveNo) {
        elements.handgloveNo.addEventListener('change', () => {
          if (elements.handgloveNo.checked) {
            state.needHandGlove = false;
            invalidateReview();
            persistState();
          }
        });
      }

      if (elements.reservationDateInput) {
        const handleDateChange = (e) => {
          const val = (e.target.value || '').trim();
          state.reservationDate = val;
          const check = validateReservationDate(val);
          setFieldError(
            elements.reservationDateInput,
            elements.dateError,
            check.valid ? '' : check.message
          );
          invalidateReview();
          persistState();
          renderCart();
        };

        elements.reservationDateInput.addEventListener('change', handleDateChange);
        elements.reservationDateInput.addEventListener('input', handleDateChange);
      }

      if (elements.reservationTimeInput) {
        elements.reservationTimeInput.addEventListener('change', (e) => {
          state.reservationTime = e.target.value;
          invalidateReview();
          persistState();
        });
      }

      // Modal Events
      if (elements.modalCloseBtn) {
        elements.modalCloseBtn.addEventListener('click', closeProductModal);
      }
      if (elements.modalBackdrop) {
        elements.modalBackdrop.addEventListener('click', closeProductModal);
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.productModal && !elements.productModal.hidden) {
          closeProductModal();
        }
      });

      if (elements.modalAddBtn) {
        elements.modalAddBtn.addEventListener('click', () => {
          if (!currentModalProduct) return;
          const product = currentModalProduct;
          let opt = '';
          let customPrice = null;

          if (product.hasSugarOption) {
            opt = modalSelectedSugar;
          } else if (product.hasPackageCustomization && modalPackageState) {
            const parts = [];
            if (product.packageConfig.hasGurame && modalPackageState.gurame) {
              parts.push(`Gurame: ${modalPackageState.gurame}`);
            }
            if (product.packageConfig.hasAyam && modalPackageState.ayam) {
              parts.push(`Ayam: ${modalPackageState.ayam}`);
            }
            if (modalPackageState.bakwan) {
              parts.push(`Bakwan: ${modalPackageState.bakwan}`);
            }
            if (modalPackageState.tumisan) {
              parts.push(`Tumis: ${modalPackageState.tumisan}`);
            }
            parts.push(
              `Nasi: ${modalPackageState.nasi}${modalPackageState.isLiwet ? ' (+Rp 10.000)' : ''}`
            );
            opt = parts.join(' | ');

            if (modalPackageState.isLiwet) {
              customPrice =
                product.dailyPrice + (product.packageConfig.nasiUpgradePrice || 10000);
            }
          }

          state.items = addOrIncrementItem(state.items, product.id, 1, opt, customPrice);

          elements.modalAddBtn.classList.add('is-added');
          elements.modalAddBtn.innerHTML = '✓ Ditambahkan ke Pesanan';

          invalidateReview();
          persistState();
          renderCart();
          const optText = opt ? ` (${opt})` : '';
          announceStatus(`${product.name}${optText} ditambahkan ke daftar pesanan.`);

          setTimeout(() => {
            closeProductModal();
          }, 350);
        });
      }

      if (elements.checkoutForm) {
        elements.checkoutForm.addEventListener('submit', (e) => {
          e.preventDefault();

          // Pastikan nilai tanggal selalu sinkron dengan input
          if (elements.reservationDateInput && elements.reservationDateInput.value) {
            state.reservationDate = elements.reservationDateInput.value.trim();
          }

          const summary = calculateCartSummary(
            state.items,
            PRODUCTS,
            state.reservationDate,
            state.isOjol
          );

          if (summary.items.length === 0) {
            announceStatus('Keranjang pesanan masih kosong. Pilih minimal 1 menu terlebih dahulu.');
            if (elements.searchInput) elements.searchInput.focus();
            alert('Keranjang pesanan masih kosong. Silakan pilih minimal 1 menu terlebih dahulu.');
            return;
          }

          const dateCheck = validateReservationDate(state.reservationDate);
          setFieldError(
            elements.reservationDateInput,
            elements.dateError,
            dateCheck.valid ? '' : dateCheck.message
          );

          const isHandGloveActive =
            state.serviceType === 'take-away' &&
            elements.handgloveYes &&
            elements.handgloveYes.checked;

          const activeTakeawayMethod =
            state.serviceType === 'take-away' &&
            elements.takeawayGosend &&
            elements.takeawayGosend.checked
              ? 'gosend'
              : 'self-pickup';

          const formValidation = validateCheckoutForm({
            tableNumber: elements.tableNumberSelect ? elements.tableNumberSelect.value : state.tableNumber,
            isOjol: state.isOjol,
            ojolRefCode: elements.ojolRefCodeInput ? elements.ojolRefCodeInput.value : state.ojolRefCode,
            customerName: elements.customerNameInput ? elements.customerNameInput.value : '',
            groupName: elements.groupNameInput ? elements.groupNameInput.value : '',
            phone: elements.phoneInput ? elements.phoneInput.value : '',
            serviceType: state.serviceType,
            reservationTime: elements.reservationTimeInput
              ? elements.reservationTimeInput.value
              : '12:00',
            guestCount: elements.guestCountInput ? elements.guestCountInput.value : '',
            notes: elements.notesInput ? elements.notesInput.value : '',
            needHandGlove: isHandGloveActive,
            takeawayMethod: activeTakeawayMethod
          });

          setFieldError(
            elements.tableNumberSelect,
            elements.tableError,
            formValidation.errors.tableNumber || ''
          );
          setFieldError(
            elements.ojolRefCodeInput,
            elements.ojolRefError,
            formValidation.errors.ojolRefCode || ''
          );
          setFieldError(
            elements.customerNameInput,
            elements.nameError,
            formValidation.errors.customerName || ''
          );
          setFieldError(
            elements.phoneInput,
            elements.phoneError,
            formValidation.errors.phone || ''
          );
          setFieldError(
            elements.reservationTimeInput,
            elements.timeError,
            formValidation.errors.reservationTime || ''
          );
          setFieldError(
            elements.guestCountInput,
            elements.guestError,
            formValidation.errors.guestCount || ''
          );

          if (!dateCheck.valid) {
            announceStatus(dateCheck.message || 'Wajib memilih tanggal kedatangan/pengambilan!');
            if (elements.reservationDateInput) {
              elements.reservationDateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              elements.reservationDateInput.focus();
            }
            alert(dateCheck.message || 'Wajib memilih Tanggal Kedatangan / Pengambilan sebelum meninjau pesanan!');
            return;
          }

          if (!formValidation.valid) {
            announceStatus('Periksa kembali data formulir pemesanan yang belum lengkap atau belum valid.');
            if (formValidation.errors.tableNumber && elements.tableNumberSelect) {
              elements.tableNumberSelect.focus();
            } else if (formValidation.errors.ojolRefCode && elements.ojolRefCodeInput) {
              elements.ojolRefCodeInput.focus();
            } else if (formValidation.errors.customerName && elements.customerNameInput) {
              elements.customerNameInput.focus();
            } else if (formValidation.errors.phone && elements.phoneInput) {
              elements.phoneInput.focus();
            } else if (formValidation.errors.reservationTime && elements.reservationTimeInput) {
              elements.reservationTimeInput.focus();
            } else if (formValidation.errors.guestCount && elements.guestCountInput) {
              elements.guestCountInput.focus();
            }
            return;
          }

          // Tampilkan panel tinjauan pesanan untuk diperiksa sebelum dikirim ke dapur
          renderReviewSummary(summary, formValidation.sanitized);
          if (elements.reviewPanel) {
            elements.reviewPanel.hidden = false;
            elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          announceStatus('Rincian pesanan siap ditinjau. Silakan periksa dan konfirmasi.');
        });
      }

      if (elements.editOrderBtn) {
        elements.editOrderBtn.addEventListener('click', () => {
          invalidateReview();
          if (elements.reviewPanel) elements.reviewPanel.hidden = true;
          if (elements.checkoutForm) {
            elements.checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          if (elements.customerNameInput) elements.customerNameInput.focus();
          announceStatus('Pesanan dapat diedit. Perbarui data formulir lalu klik Tinjau Pesanan.');
        });
      }

      [
        elements.tableNumberSelect,
        elements.ojolRefCodeInput,
        elements.customerNameInput,
        elements.groupNameInput,
        elements.phoneInput,
        elements.notesInput,
        elements.guestCountInput
      ].forEach((input) => {
        if (input) input.addEventListener('input', invalidateReview);
      });

      // Floating Order Shortcut click
      if (elements.floatingOrderBar) {
        elements.floatingOrderBar.addEventListener('click', () => {
          const orderSec = document.getElementById('pesan');
          if (orderSec) {
            orderSec.scrollIntoView({ behavior: 'smooth' });
          }
        });
      }
    }

    // Pemulihan draf dari LocalStorage
    if (typeof loadCartDraft === 'function') {
      const draft = loadCartDraft(PRODUCTS);
      state.items = draft.items || [];
      state.reservationDate = draft.reservationDate || '';
      state.serviceType = draft.serviceType || 'dine-in';
      state.reservationTime = draft.reservationTime || '12:00';
      state.needHandGlove = Boolean(draft.needHandGlove);
      state.takeawayMethod = draft.takeawayMethod === 'gosend' ? 'gosend' : 'self-pickup';
      state.tableNumber = draft.tableNumber || '';
      state.isOjol = Boolean(draft.isOjol);
      state.ojolRefCode = draft.ojolRefCode || '';

      if (elements.tableNumberSelect && state.tableNumber) {
        elements.tableNumberSelect.value = state.tableNumber;
      }

      if (elements.ojolModeToggle) {
        elements.ojolModeToggle.checked = state.isOjol;
        if (elements.ojolRefGroup) {
          elements.ojolRefGroup.style.display = state.isOjol ? 'block' : 'none';
        }
      }

      if (elements.ojolRefCodeInput && state.ojolRefCode) {
        elements.ojolRefCodeInput.value = state.ojolRefCode;
      }

      if (elements.reservationDateInput) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        elements.reservationDateInput.min = todayStr;
        if (state.reservationDate) {
          elements.reservationDateInput.value = state.reservationDate;
        } else {
          state.reservationDate = todayStr;
          elements.reservationDateInput.value = todayStr;
        }
      }

      if (elements.reservationTimeInput && state.reservationTime) {
        elements.reservationTimeInput.value = state.reservationTime;
      }

      if (state.serviceType === 'take-away' && elements.serviceTypeTakeAway) {
        elements.serviceTypeTakeAway.checked = true;
      } else if (elements.serviceTypeDineIn) {
        elements.serviceTypeDineIn.checked = true;
      }

      if (state.takeawayMethod === 'gosend' && elements.takeawayGosend) {
        elements.takeawayGosend.checked = true;
      } else if (elements.takeawaySelf) {
        elements.takeawaySelf.checked = true;
      }

      if (state.needHandGlove && elements.handgloveYes) {
        elements.handgloveYes.checked = true;
      } else if (elements.handgloveNo) {
        elements.handgloveNo.checked = true;
      }

      updateServiceTypeUI();
    }

    // Global Action Helpers
    if (typeof window !== 'undefined') {
      window.addSpecificItem = function (productId, option = '') {
        state.items = addOrIncrementItem(state.items, productId, 1, option);
        invalidateReview();
        persistState();
        renderCart();
        const product = PRODUCTS.find((p) => p.id === productId);
        const name = product ? product.name : productId;
        announceStatus(`${name} telah ditambahkan ke keranjang pesanan.`);
        const cartSection = document.getElementById('pesan');
        if (cartSection) {
          cartSection.scrollIntoView({ behavior: 'smooth' });
        }
      };

      window.selectCatalogTab = function (tabId) {
        state.activeTab = tabId;
        state.selectedCategory = 'Semua';
        renderTabs();
        renderCategories();
        renderCatalog();
        const catalogSection = document.getElementById('katalog');
        if (catalogSection) {
          catalogSection.scrollIntoView({ behavior: 'smooth' });
        }
      };
    }

    function setupRealtimeMenusListener() {
      const menusCol = collection(db, 'menus');
      onSnapshot(menusCol, (snapshot) => {
        if (snapshot.empty) {
          console.log('[Pelanggan] Koleksi menus di Firestore kosong. Tetap memakai menu default.');
          return;
        }
        const firestoreMenus = [];
        snapshot.forEach((docSnap) => {
          firestoreMenus.push({ id: docSnap.id, ...docSnap.data() });
        });
        firestoreMenus.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));
        PRODUCTS = firestoreMenus;
        renderCatalog();
        renderCart();
      }, (err) => {
        console.warn('[Pelanggan] Gagal membaca koleksi menus dari Firestore:', err);
      });
    }

    renderTabs();
    renderCategories();
    renderCatalog();
    renderCart();
    initEvents();
    setupRealtimeMenusListener();
  }

  // Jalankan ketika DOM sudah siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
