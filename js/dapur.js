/**
 * Saung H. Amir - Layar Dapur Siaga (KDS) & Sistem Alarm Darurat
 * File: js/dapur.js
 */

import { menuData } from './data.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp
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

// Inisialisasi Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Elemen DOM
const dom = {
  pinOverlay: document.getElementById('pin-overlay'),
  pinInput: document.getElementById('pin-input'),
  pinForm: document.getElementById('pin-form'),
  pinError: document.getElementById('pin-error'),
  pinSubmitBtn: document.getElementById('pin-submit-btn'),
  dapurLockBtn: document.getElementById('dapur-lock-btn'),
  dapurClock: document.getElementById('dapur-clock'),
  btnTestSound: document.getElementById('btn-test-sound'),
  badgeCountDapur: document.getElementById('badge-count-dapur'),
  kitchenContainer: document.getElementById('kitchen-cards-container'),
  printArea: document.getElementById('thermal-print-area')
};

/* --------------------------------------------------------------------------
   1. Autentikasi PIN & Sesi
   -------------------------------------------------------------------------- */
const VALID_PASSWORDS = ['Salzabill4', '262012'];

function checkAuth() {
  const sessionAuth = sessionStorage.getItem('saha_pos_auth');
  if (sessionAuth === 'true') {
    if (dom.pinOverlay) dom.pinOverlay.style.display = 'none';
  } else {
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
    dom.pinError.textContent = '';
    dom.pinOverlay.style.display = 'none';
  } else {
    dom.pinError.textContent = 'Password / PIN salah. Silakan coba lagi.';
    dom.pinInput.value = '';
    dom.pinInput.focus();
  }
}

function lockScreen() {
  sessionStorage.removeItem('saha_pos_auth');
  if (dom.pinOverlay) {
    dom.pinOverlay.style.display = 'flex';
    dom.pinError.textContent = '';
    dom.pinInput.value = '';
    dom.pinInput.focus();
  }
}

/* --------------------------------------------------------------------------
   2. Web Audio API: Suara Sirine Alarm Darurat (Penetrating Emergency Siren)
   -------------------------------------------------------------------------- */
let audioCtx = null;

function playFireAlarmSiren() {
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
    // Sirine berulang 8 siklus (sekitar 4 detik)
    const cycles = 8;
    const cycleDuration = 0.45; // 450ms per swing (naik-turun melengking)

    for (let i = 0; i < cycles; i++) {
      const tStart = now + (i * cycleDuration);

      // Osc 1: Sawtooth melengking (720Hz -> 1180Hz -> 720Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(720, tStart);
      osc1.frequency.linearRampToValueAtTime(1180, tStart + (cycleDuration * 0.5));
      osc1.frequency.linearRampToValueAtTime(720, tStart + cycleDuration);

      gain1.gain.setValueAtTime(0.45, tStart);
      gain1.gain.setValueAtTime(0.45, tStart + (cycleDuration * 0.9));
      gain1.gain.exponentialRampToValueAtTime(0.001, tStart + cycleDuration);

      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);

      // Osc 2: Square wave harmonic (alarm bite sekunder 960Hz <-> 1440Hz)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(960, tStart);
      osc2.frequency.linearRampToValueAtTime(1440, tStart + (cycleDuration * 0.5));
      osc2.frequency.linearRampToValueAtTime(960, tStart + cycleDuration);

      gain2.gain.setValueAtTime(0.2, tStart);
      gain2.gain.setValueAtTime(0.2, tStart + (cycleDuration * 0.9));
      gain2.gain.exponentialRampToValueAtTime(0.001, tStart + cycleDuration);

      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);

      osc1.start(tStart);
      osc1.stop(tStart + cycleDuration);
      osc2.start(tStart);
      osc2.stop(tStart + cycleDuration);
    }
  } catch (err) {
    console.warn('Gagal memutar sirine dapur:', err);
  }
}

/* --------------------------------------------------------------------------
   3. Sistem Kelap-Kelip Layar Merah (Flash 5 Detik) & Highlight Tiket Baru
   -------------------------------------------------------------------------- */
let fireAlarmTimeout = null;
let recentlyAddedOrderIds = new Set();
let recentHighlightTimeout = null;

function triggerFireAlarm(newTicketIds = []) {
  // 1. Putar sirine melengking
  playFireAlarmSiren();

  // 2. Tandai ID tiket yang baru masuk agar berkedip menyala (glowing red)
  if (Array.isArray(newTicketIds) && newTicketIds.length > 0) {
    newTicketIds.forEach((id) => recentlyAddedOrderIds.add(id));

    // Bersihkan highlight kartu setelah 12 detik
    if (recentHighlightTimeout) clearTimeout(recentHighlightTimeout);
    recentHighlightTimeout = setTimeout(() => {
      recentlyAddedOrderIds.clear();
      // Hilangkan class berkedip dari kartu yang ada
      document.querySelectorAll('.kitchen-card.new-ticket-flash').forEach((card) => {
        card.classList.remove('new-ticket-flash');
        const badge = card.querySelector('.badge-new-ticket');
        if (badge) badge.remove();
      });
    }, 12000);
  }

  // 3. Efek Layar Kelap-Kelip Merah (Kaya Kebakaran) selama 5 Detik
  document.body.classList.add('fire-alarm-active');

  if (fireAlarmTimeout) clearTimeout(fireAlarmTimeout);
  fireAlarmTimeout = setTimeout(() => {
    document.body.classList.remove('fire-alarm-active');
  }, 5000);
}

/* --------------------------------------------------------------------------
   4. Jam Live & Format Utilitas
   -------------------------------------------------------------------------- */
function startClock() {
  function update() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    if (dom.dapurClock) {
      dom.dapurClock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} WIB`;
    }
  }
  update();
  setInterval(update, 1000);
}

function formatDate(dateObj) {
  if (!dateObj) return '-';
  const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

function formatTimeOnly(dateObj) {
  if (!dateObj) return '-';
  const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} WIB`;
}

/* --------------------------------------------------------------------------
   5. Listener Real-Time Antrean Dapur (KDS)
   -------------------------------------------------------------------------- */
let previousKitchenIds = new Set();
let isKitchenFirstLoad = true;

function setupKitchenQueueListener() {
  const q = query(
    collection(db, 'orders'),
    where('kitchenStatus', '==', 'baru')
  );

  onSnapshot(q, (snapshot) => {
    const orders = [];
    const currentIds = new Set();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      orders.push({ id: docSnap.id, ...data });
      currentIds.add(docSnap.id);
    });

    // Urutkan tiket paling lama masuk di atas (FIFO - First In First Out)
    orders.sort((a, b) => {
      const tA = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0;
      const tB = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0;
      return tA - tB;
    });

    // Deteksi Tiket Baru Masuk
    if (!isKitchenFirstLoad) {
      const newlyAddedIds = [];
      currentIds.forEach((id) => {
        if (!previousKitchenIds.has(id)) {
          newlyAddedIds.push(id);
        }
      });

      if (newlyAddedIds.length > 0) {
        // Trigger Sirine & Layar Kelap-Kelip Merah Darurat
        triggerFireAlarm(newlyAddedIds);
      }
    } else {
      isKitchenFirstLoad = false;
    }
    previousKitchenIds = currentIds;

    // Perbarui Badge Jumlah Tiket Masuk di Header
    if (dom.badgeCountDapur) {
      dom.badgeCountDapur.textContent = `${orders.length} Tiket Masuk`;
      if (orders.length > 0) {
        dom.badgeCountDapur.classList.add('badge-alert');
      } else {
        dom.badgeCountDapur.classList.remove('badge-alert');
      }
    }

    renderKitchenCards(orders);
  }, (err) => {
    console.error('Error onSnapshot dapur:', err);
  });
}

/* --------------------------------------------------------------------------
   6. Render Kartu Antrean Dapur
   -------------------------------------------------------------------------- */
function renderKitchenCards(orders) {
  if (!dom.kitchenContainer) return;

  if (orders.length === 0) {
    dom.kitchenContainer.innerHTML = `
      <div class="dapur-empty-state">
        <span class="dapur-empty-icon">🍳</span>
        <h3 class="dapur-empty-title">Dapur Siaga: Belum Ada Pesanan Masuk</h3>
        <p>Pesanan baru dari QR Meja maupun Kasir POS akan otomatis muncul di sini disertai sirine keras dan kelap-kelip layar merah.</p>
      </div>
    `;
    return;
  }

  dom.kitchenContainer.innerHTML = '';

  orders.forEach((order) => {
    const card = document.createElement('article');
    const isAddon = Boolean(order.isAddon);
    const isOjol = Boolean(order.isOjol);
    const isNew = recentlyAddedOrderIds.has(order.id);

    card.className = `kitchen-card ${isAddon ? 'addon-card' : ''} ${isOjol ? 'ojol-card' : ''} ${isNew ? 'new-ticket-flash' : ''}`;

    const timeStr = formatTimeOnly(order.createdAt);
    const tableTitle = isOjol
      ? `🛵 [GOFOOD - Kode: ${order.kodeOjol || order.kodeReferensi || 'Driver'}]`
      : order.nomorMeja;

    let badgeBarHtml = '';
    if (isNew) {
      badgeBarHtml += `
        <div class="badge-new-ticket">
          <span>🚨</span>
          <span>PESANAN BARU MASUK!</span>
        </div>
      `;
    }
    if (isOjol) {
      badgeBarHtml += `
        <div class="badge-ojol-alert">
          <span>🛵</span>
          <span>Pesanan Ojek Online (GoFood/GrabFood)</span>
        </div>
      `;
    }
    if (isAddon) {
      badgeBarHtml += `
        <div class="badge-addon-alert">
          <span>⚠️</span>
          <span>${order.nomorMeja} (Pesanan Tambahan)</span>
        </div>
      `;
    }

    // Render daftar item masakan
    const itemsHtml = (order.items || []).map((item) => {
      const qty = item.qty || item.quantity || 1;
      const name = item.name || item.nama || 'Menu';
      const note = (item.note || item.catatan || '').trim();

      return `
        <div class="kitchen-item-row">
          <div class="kitchen-item-main">
            <span class="kitchen-item-qty">${qty}x</span>
            <span class="kitchen-item-name">${name}</span>
          </div>
          ${note ? `<div class="kitchen-item-note">📝 Catatan: ${note}</div>` : ''}
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <header class="kitchen-card-header">
        <strong class="kitchen-table-name">${tableTitle}</strong>
        <span class="kitchen-time-badge">🕒 ${timeStr}</span>
      </header>
      ${badgeBarHtml ? `<div class="kitchen-badge-bar">${badgeBarHtml}</div>` : ''}
      <div class="kitchen-items-list">
        ${itemsHtml}
      </div>
      <footer class="kitchen-card-footer">
        <button type="button" class="btn-kitchen-print" data-id="${order.id}">
          <span>🖨️</span>
          <span>Cetak Dapur</span>
        </button>
        <button type="button" class="btn-kitchen-done" data-id="${order.id}">
          <span>✅</span>
          <span>Selesai Dimasak</span>
        </button>
      </footer>
    `;

    // Handler Cetak Tiket Dapur
    card.querySelector('.btn-kitchen-print').addEventListener('click', () => {
      printKitchenTicket(order);
    });

    // Handler Selesai Dimasak
    card.querySelector('.btn-kitchen-done').addEventListener('click', async () => {
      const doneBtn = card.querySelector('.btn-kitchen-done');
      doneBtn.disabled = true;
      doneBtn.textContent = 'Memproses...';

      try {
        await updateDoc(doc(db, 'orders', order.id), {
          kitchenStatus: 'selesai',
          cookedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Gagal memperbarui status dapur:', err);
        alert('Gagal memperbarui status: ' + (err.message || 'Kesalahan jaringan.'));
        doneBtn.disabled = false;
        doneBtn.innerHTML = '<span>✅</span><span>Selesai Dimasak</span>';
      }
    });

    dom.kitchenContainer.appendChild(card);
  });
}

/* --------------------------------------------------------------------------
   7. Cetak Tiket Dapur Thermal ESC/POS (58mm / 80mm)
   -------------------------------------------------------------------------- */
function printKitchenTicket(order) {
  if (!dom.printArea) return;

  const waktu = formatDate(order.createdAt);
  const tableTitle = order.isOjol
    ? `[GOFOOD - Kode: ${order.kodeOjol || order.kodeReferensi || 'Driver'}]`
    : order.nomorMeja;

  const itemsList = (order.items || []).map((item) => {
    const qty = item.qty || 1;
    const name = item.name || item.nama || 'Menu';
    const note = (item.note || item.catatan || '').trim();

    return `
      <div class="print-row print-bold">
        <span>[ ${qty} ] ${name}</span>
      </div>
      ${note ? `<div class="print-item-note">* Catatan: ${note}</div>` : ''}
    `;
  }).join('');

  dom.printArea.innerHTML = `
    <div class="print-center print-header-title">*** TIKET DAPUR ***</div>
    <div class="print-center print-bold">SAUNG HAJI AMIR</div>
    <div class="print-center">Dimasak Dadakan</div>
    <div class="print-divider"></div>
    <div class="print-row"><span>Meja / Order:</span><strong class="print-item-title">${tableTitle}</strong></div>
    ${order.isAddon ? `<div class="print-bold print-center" style="background:#000; color:#fff; padding:2px;">*** PESANAN TAMBAHAN ***</div>` : ''}
    <div class="print-row"><span>Waktu Pesan:</span><span>${waktu}</span></div>
    <div class="print-row"><span>ID Order:</span><span>${order.id.slice(-6).toUpperCase()}</span></div>
    <div class="print-divider"></div>
    <div class="print-bold">QTY  MENU & PESANAN</div>
    <div class="print-divider"></div>
    ${itemsList}
    <div class="print-divider"></div>
    <div class="print-center print-bold">-- Harap Segera Disiapkan --</div>
  `;

  window.print();
}

/* --------------------------------------------------------------------------
   8. Inisialisasi Layar Dapur
   -------------------------------------------------------------------------- */
function init() {
  checkAuth();
  startClock();

  // PIN Handlers
  if (dom.pinForm) dom.pinForm.addEventListener('submit', handlePinSubmit);
  if (dom.pinSubmitBtn) dom.pinSubmitBtn.addEventListener('click', handlePinSubmit);
  if (dom.dapurLockBtn) dom.dapurLockBtn.addEventListener('click', lockScreen);

  // Tombol Uji Coba Sirine & Flash
  if (dom.btnTestSound) {
    dom.btnTestSound.addEventListener('click', () => {
      triggerFireAlarm(['test-ticket-preview']);
    });
  }

  // Jalankan Listener Real-Time Antrean Dapur
  setupKitchenQueueListener();
}

document.addEventListener('DOMContentLoaded', init);
