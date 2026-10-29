import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  orderBy,
  getDocs
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

// Inisialisasi Firebase App & Firestore Database
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Normalisasi nomor HP/WhatsApp
 */
export function normalizePhone(rawPhone) {
  if (typeof rawPhone !== 'string') return '';
  const cleaned = rawPhone.trim().replace(/[\s\-()]/g, '');
  return cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
}

/**
 * Memeriksa apakah nomor meja tertentu saat ini sudah memiliki tiket belum lunas di Firestore
 * Jika ya, pesanan baru akan ditandai sebagai Pesanan Tambahan (isAddon: true)
 */
export async function checkIsAddonOrder(nomorMeja) {
  if (!nomorMeja || nomorMeja === 'Take-Away' || nomorMeja === 'Take-Away (Bungkus)') {
    return false;
  }
  try {
    const q = query(
      collection(db, 'orders'),
      where('nomorMeja', '==', nomorMeja),
      where('paymentStatus', '==', 'belum_lunas')
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.warn('Gagal memeriksa status addon meja di Firestore:', err);
    return false;
  }
}

/**
 * Validasi Formulir Pemesanan & Data Meja / Mode Ojol
 */
export function validateCheckoutForm({
  tableNumber,
  isOjol,
  ojolRefCode,
  customerName,
  groupName,
  phone,
  serviceType,
  reservationTime,
  guestCount,
  notes,
  needHandGlove,
  takeawayMethod
}) {
  const errors = {};
  const isOjolActive = Boolean(isOjol);
  const trimmedTable = (tableNumber || '').trim();
  const trimmedRefCode = (ojolRefCode || '').trim();
  let trimmedName = (customerName || '').trim();
  const trimmedGroup = (groupName || '').trim();
  const trimmedNotes = (notes || '').trim();
  const trimmedGuest = (guestCount || '').trim();
  const normalizedPhone = normalizePhone(phone || '');
  const selectedService =
    trimmedTable === 'Take-Away (Bungkus)' || trimmedTable === 'Take-Away' || isOjolActive
      ? 'take-away'
      : (serviceType === 'take-away' ? 'take-away' : 'dine-in');
  const trimmedTime = (reservationTime || '').trim();
  const isHandGloveNeeded = Boolean(needHandGlove);
  const selectedTakeawayMethod = takeawayMethod === 'gosend' ? 'gosend' : 'self-pickup';
  const takeawayMethodText =
    selectedTakeawayMethod === 'gosend'
      ? 'Diambil oleh Kurir Go-Send / GrabExpress'
      : 'Ambil Sendiri Langsung ke Restoran';

  // 1. Validasi Nomor Meja
  if (!trimmedTable) {
    errors.tableNumber = 'Pilih nomor meja (Meja 1–15) atau Take-Away.';
  }

  // 2. Validasi Mode Ojol & Kode Referensi
  if (isOjolActive) {
    if (!trimmedRefCode) {
      errors.ojolRefCode = 'Masukkan Kode Referensi Pesanan (contoh: GF-1234 atau 4 digit).';
    } else if (trimmedRefCode.length < 2 || trimmedRefCode.length > 50) {
      errors.ojolRefCode = 'Kode referensi harus terdiri dari 2 hingga 50 karakter.';
    }

    if (!trimmedName) {
      trimmedName = `Driver Ojol (${trimmedRefCode || 'GoFood'})`;
    }
  }

  // 3. Validasi Nama Pemesan (untuk non-ojol)
  if (!isOjolActive) {
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      errors.customerName = 'Nama pemesan harus terdiri dari 2 hingga 80 karakter.';
    }
  }

  // 4. Validasi Nomor Telepon
  if (!isOjolActive && normalizedPhone) {
    const isPhoneDigits = /^\d{8,15}$/.test(normalizedPhone);
    const validPrefix =
      normalizedPhone.startsWith('08') || normalizedPhone.startsWith('62');
    if (!isPhoneDigits || !validPrefix) {
      errors.phone = 'Nomor WhatsApp harus 8–15 digit dengan awalan 08 atau 62.';
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
      serviceLabel:
        selectedService === 'dine-in'
          ? `Makan di Tempat (${trimmedTable})`
          : (isOjolActive ? `Mode Ojol (${trimmedRefCode || 'Delivery'})` : 'Bungkus (Take-Away)'),
      reservationTime: trimmedTime || '12:00',
      guestCount: trimmedGuest || '-',
      notes: trimmedNotes || '-',
      needHandGlove: isHandGloveNeeded,
      handGloveText: isHandGloveNeeded ? 'Ya, perlu sarung tangan plastik' : 'Tidak perlu',
      takeawayMethod: selectedTakeawayMethod,
      takeawayMethodText: takeawayMethodText
    }
  };
}

/**
 * Menyimpan Pesanan Langsung ke Firestore Collection "orders"
 * Struktur Dokumen Sesuai Spesifikasi Proyek:
 * {
 *   nomorMeja: string,
 *   orderType: "dine_in" | "take_away",
 *   isOjol: boolean,
 *   kodeOjol: string,
 *   isAddon: boolean,
 *   items: [ { id, name, qty, price, subtotal, note } ],
 *   totalHarga: number,
 *   kitchenStatus: "baru",
 *   paymentStatus: "belum_lunas",
 *   paymentMethod: "",
 *   createdAt: serverTimestamp()
 * }
 */
export async function sendOrderToFirestore(orderData) {
  if (!orderData) {
    throw new Error('Data pesanan tidak boleh kosong.');
  }

  const nomorMejaClean = String(orderData.nomorMeja || orderData.tableNumber || 'Take-Away').trim();
  const isTakeAway =
    nomorMejaClean === 'Take-Away' ||
    nomorMejaClean === 'Take-Away (Bungkus)' ||
    Boolean(orderData.isOjol) ||
    orderData.orderType === 'take_away' ||
    orderData.serviceType === 'take-away';

  const orderType = isTakeAway ? 'take_away' : 'dine_in';
  const isOjol = Boolean(orderData.isOjol);
  const kodeOjol = String(orderData.kodeOjol || orderData.kodeReferensi || orderData.ojolRefCode || '').trim();

  // Cek apakah meja ini sudah punya pesanan belum lunas (isAddon)
  let isAddon = Boolean(orderData.isAddon);
  if (orderData.isAddon === undefined && !isTakeAway) {
    isAddon = await checkIsAddonOrder(nomorMejaClean);
  }

  // Format array items sesuai spesifikasi: [ { id, name, qty, price, subtotal, note } ]
  const formattedItems = (orderData.items || []).map((item) => {
    const qty = Number(item.qty || item.quantity || 1);
    const price = Number(item.price || item.unitPrice || item.harga || 0);
    const subtotal = Number(item.subtotal || (qty * price));
    const note = String(item.note || item.catatan || item.option || '').trim();

    return {
      id: String(item.id || item.productId || 'menu-item'),
      name: String(item.name || item.nama || 'Menu Saung H. Amir'),
      qty: qty,
      price: price,
      subtotal: subtotal,
      note: note
    };
  });

  const totalHarga = Number(
    orderData.totalHarga !== undefined
      ? orderData.totalHarga
      : formattedItems.reduce((acc, it) => acc + it.subtotal, 0)
  );

  const payload = {
    nomorMeja: nomorMejaClean,
    orderType: orderType,
    isOjol: isOjol,
    kodeOjol: isOjol ? kodeOjol : '',
    isAddon: isAddon,
    items: formattedItems,
    totalHarga: totalHarga,
    kitchenStatus: 'baru',
    paymentStatus: 'belum_lunas',
    paymentMethod: String(orderData.paymentMethod || ''),
    createdAt: serverTimestamp()
  };

  // Tambahkan konteks tambahan jika tersedia
  if (orderData.customerName) payload.customerName = String(orderData.customerName);
  if (orderData.phone && orderData.phone !== '-') payload.phone = String(orderData.phone);
  if (orderData.notes && orderData.notes !== '-') payload.notes = String(orderData.notes);

  const ordersCollection = collection(db, 'orders');
  const docRef = await addDoc(ordersCollection, payload);

  return {
    success: true,
    orderId: docRef.id,
    isAddon: isAddon,
    data: payload
  };
}

// Hubungkan ke global window agar dapat diakses dari modul lain maupun script browser biasa
if (typeof window !== 'undefined') {
  window.app = app;
  window.db = db;
  window.sendOrderToFirestore = sendOrderToFirestore;
  window.checkIsAddonOrder = checkIsAddonOrder;
  window.validateCheckoutForm = validateCheckoutForm;
  window.normalizePhone = normalizePhone;
  window.serverTimestamp = serverTimestamp;
  window.collection = collection;
  window.addDoc = addDoc;
  window.onSnapshot = onSnapshot;
  window.query = query;
  window.where = where;
  window.doc = doc;
  window.updateDoc = updateDoc;
  window.writeBatch = writeBatch;
  window.orderBy = orderBy;
  window.getDocs = getDocs;
}
