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
export const firebaseConfig = {
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
 * Membersihkan spasi, tanda strip, kurung, dan awalan +
 */
export function normalizePhone(rawPhone) {
  if (typeof rawPhone !== 'string') return '';
  const cleaned = rawPhone.trim().replace(/[\s\-()]/g, '');
  return cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
}

/**
 * Membaca URL Query Parameter untuk Mendeteksi Nomor Meja dari Scan QR
 * Mendukung format: ?meja=4, ?meja=Meja%204, ?meja=Meja%20Kiri%20Ujung, ?meja=Lesehan%201, dll.
 * Mendukung fallback parameter: ?table=..., ?qr=...
 *
 * @param {string} [urlSearch] - Optional string window.location.search
 * @returns {string|null} Nomor meja bersih atau null jika tidak terdeteksi
 */
export function parseUrlTableParam(urlSearch = (typeof window !== 'undefined' ? window.location.search : '')) {
  if (!urlSearch) return null;
  try {
    const params = new URLSearchParams(urlSearch);
    const rawVal = params.get('meja') || params.get('table') || params.get('qr');
    if (!rawVal) return null;

    let cleanVal = decodeURIComponent(rawVal).trim();
    if (!cleanVal) return null;

    // Jika hanya angka (contoh: "4", "12"), jadikan "Meja 4"
    if (/^\d+$/.test(cleanVal)) {
      cleanVal = `Meja ${cleanVal}`;
    }

    return cleanVal;
  } catch (err) {
    console.warn('[Checkout] Gagal membaca parameter URL meja:', err);
    return null;
  }
}

/**
 * Deteksi Sumber Akses Pelanggan berdasarkan URL
 * @param {string} [urlSearch]
 * @returns {{ source: 'qr'|'wa'|'unknown', tableNumber: string|null, isTableLocked: boolean }}
 */
export function detectAccessSource(urlSearch = (typeof window !== 'undefined' ? window.location.search : '')) {
  const table = parseUrlTableParam(urlSearch);
  if (table) {
    return {
      source: 'qr',
      tableNumber: table,
      isTableLocked: true
    };
  }

  // Cek jika ada parameter sumber eksplisit
  try {
    const params = new URLSearchParams(urlSearch || '');
    const src = (params.get('sumber') || params.get('source') || params.get('from') || '').toLowerCase();
    if (src === 'wa' || src === 'whatsapp') {
      return { source: 'wa', tableNumber: null, isTableLocked: false };
    }
    if (src === 'qr') {
      return { source: 'qr', tableNumber: null, isTableLocked: false };
    }
  } catch (e) {
    // ignore
  }

  return {
    source: 'unknown',
    tableNumber: null,
    isTableLocked: false
  };
}

/**
 * Memeriksa apakah nomor meja tertentu saat ini sudah memiliki tiket belum lunas di Firestore
 * Jika ya, pesanan baru akan ditandai sebagai Pesanan Tambahan (isAddon: true)
 */
export async function checkIsAddonOrder(nomorMeja) {
  if (!nomorMeja || nomorMeja === 'Take-Away' || nomorMeja === 'Take-Away (Bungkus)' || nomorMeja === 'Reservasi Saung') {
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
 * Validasi Formulir Pemesanan & Data Meja Berdasarkan Tipe Pesanan
 * Mendukung Mode Ringkas (QR Meja: Dine-In & Take-Away) dan Mode Lengkap (Reservasi & Bungkus)
 */
export function validateCheckoutForm({
  tipePesanan,
  diningType = 'dine-in',
  tableNumber,
  isOjol,
  ojolRefCode,
  customerName,
  groupName,
  phone,
  serviceType,
  reservationDate,
  reservationTime,
  guestCount,
  notes,
  needHandGlove,
  takeawayMethod
}) {
  const errors = {};

  // Deteksi tipe pesanan yang aktif
  let activeType = tipePesanan;
  if (!activeType) {
    if (tableNumber === 'Take-Away' || tableNumber === 'Take-Away (Bungkus)' || serviceType === 'take-away') {
      activeType = 'takeaway';
    } else if (serviceType === 'reservasi' || tableNumber === 'Reservasi Saung') {
      activeType = 'reservasi';
    } else {
      activeType = 'qr';
    }
  }

  const isOjolActive = Boolean(isOjol) && activeType === 'takeaway';
  const trimmedTable = (tableNumber || '').trim();
  const trimmedRefCode = (ojolRefCode || '').trim();
  let trimmedName = (customerName || '').trim();
  const trimmedGroup = (groupName || '').trim();
  const trimmedNotes = (notes || '').trim();
  const trimmedGuest = (guestCount || '').trim();
  const normalizedPhone = normalizePhone(phone || '');
  const trimmedTime = (reservationTime || '').trim();
  const trimmedDate = (reservationDate || '').trim();
  const isHandGloveNeeded = Boolean(needHandGlove);
  const selectedTakeawayMethod = takeawayMethod === 'gosend' ? 'gosend' : 'self-pickup';
  const takeawayMethodText =
    selectedTakeawayMethod === 'gosend'
      ? 'Diambil oleh Kurir Go-Send / GrabExpress'
      : 'Ambil Sendiri Langsung ke Restoran';

  // 1. Validasi Berdasarkan Tipe Pesanan
  if (activeType === 'qr' || activeType === 'PESAN LEWAT QR MEJA') {
    // 🍽️ MODE SCAN QR MEJA (MODE RINGKAS)
    // HANYA 3 INPUT: Nama Pemesan (wajib), No. Telp/WA (wajib), Catatan (opsional) + Nomor Meja
    if (!trimmedTable || trimmedTable === 'Take-Away (Bungkus)' || trimmedTable === 'Take-Away' || trimmedTable === 'Reservasi Saung') {
      errors.tableNumber = 'Silakan pilih nomor meja Anda (Meja 1–15).';
    }

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      errors.customerName = 'Nama pemesan wajib diisi (2 hingga 80 karakter).';
    }

    if (!normalizedPhone) {
      errors.phone = 'No. Telp / WhatsApp wajib diisi.';
    } else {
      const isPhoneDigits = /^\d{8,15}$/.test(normalizedPhone);
      const validPrefix = normalizedPhone.startsWith('08') || normalizedPhone.startsWith('62');
      if (!isPhoneDigits || !validPrefix) {
        errors.phone = 'No. Telp / WhatsApp harus 8–15 digit dengan awalan 08 atau 62.';
      }
    }

  } else if (activeType === 'reservasi') {
    // 📅 Reservasi (Datang Nanti)
    // TAMPILKAN: Nama Lengkap, Rombongan, Nomor WhatsApp, Jumlah Orang, Catatan, Tanggal & Jam
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      errors.customerName = 'Nama pemesan harus terdiri dari 2 hingga 80 karakter.';
    }
    if (!normalizedPhone) {
      errors.phone = 'Nomor WhatsApp wajib diisi untuk konfirmasi reservasi.';
    } else {
      const isPhoneDigits = /^\d{8,15}$/.test(normalizedPhone);
      const validPrefix = normalizedPhone.startsWith('08') || normalizedPhone.startsWith('62');
      if (!isPhoneDigits || !validPrefix) {
        errors.phone = 'Nomor WhatsApp harus 8–15 digit dengan awalan 08 atau 62.';
      }
    }
    if (!trimmedGuest) {
      errors.guestCount = 'Konfirmasi jumlah orang yang akan datang (contoh: 5 Orang).';
    }
    if (!trimmedTime) {
      errors.reservationTime = 'Tentukan jam rencana kedatangan (10.00 – 17.00 WIB).';
    }
    if (!trimmedDate) {
      errors.reservationDate = 'Pilih tanggal rencana kedatangan.';
    }

  } else if (activeType === 'takeaway') {
    // 🥡 Bungkus (Take-Away)
    // TAMPILKAN: Nama Lengkap, Nomor WhatsApp, Catatan, dan Jam Pengambilan
    if (isOjolActive) {
      if (!trimmedRefCode) {
        errors.ojolRefCode = 'Masukkan Kode Referensi Pesanan (contoh: GF-1234 atau 4 digit).';
      } else if (trimmedRefCode.length < 2 || trimmedRefCode.length > 50) {
        errors.ojolRefCode = 'Kode referensi harus terdiri dari 2 hingga 50 karakter.';
      }
      if (!trimmedName) {
        trimmedName = `Driver Ojol (${trimmedRefCode || 'GoFood'})`;
      }
    } else {
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        errors.customerName = 'Nama pemesan harus terdiri dari 2 hingga 80 karakter.';
      }
      if (!normalizedPhone) {
        errors.phone = 'Nomor WhatsApp wajib diisi agar dapur dapat menghubungi saat pesanan siap.';
      } else {
        const isPhoneDigits = /^\d{8,15}$/.test(normalizedPhone);
        const validPrefix = normalizedPhone.startsWith('08') || normalizedPhone.startsWith('62');
        if (!isPhoneDigits || !validPrefix) {
          errors.phone = 'Nomor WhatsApp harus 8–15 digit dengan awalan 08 atau 62.';
        }
      }
    }
    if (!trimmedTime) {
      errors.reservationTime = 'Tentukan jam rencana pengambilan pesanan bungkus.';
    }
  }

  // Tentukan label dan nilai sanitasi
  let finalTable = trimmedTable;
  let finalOrderType = 'dine_in';
  let finalServiceType = 'dine-in';
  let finalServiceLabel = 'Pesan Lewat Meja';
  let finalTipePesanan = 'PESAN LEWAT QR MEJA';
  let finalTipeMakan = 'Makan di Tempat (Dine-In)';

  if (activeType === 'qr' || activeType === 'PESAN LEWAT QR MEJA') {
    finalTable = trimmedTable || 'Meja 1';
    finalTipePesanan = 'PESAN LEWAT QR MEJA';
    if (diningType === 'take-away' || diningType === 'takeaway') {
      finalOrderType = 'take_away';
      finalServiceType = 'take-away';
      finalTipeMakan = 'Bawa Pulang (Take-Away)';
      finalServiceLabel = `Pesan Lewat Meja - Bawa Pulang (${finalTable})`;
    } else {
      finalOrderType = 'dine_in';
      finalServiceType = 'dine-in';
      finalTipeMakan = 'Makan di Tempat (Dine-In)';
      finalServiceLabel = `Pesan Lewat Meja (${finalTable})`;
    }
  } else if (activeType === 'reservasi') {
    finalTable = 'Reservasi Saung';
    finalOrderType = 'dine_in';
    finalServiceType = 'reservasi';
    finalTipeMakan = 'Makan di Tempat (Reservasi)';
    finalServiceLabel = 'Reservasi Saung Lesehan';
    finalTipePesanan = 'Reservasi';
  } else if (activeType === 'takeaway') {
    finalTable = 'Take-Away';
    finalOrderType = 'take_away';
    finalServiceType = 'take-away';
    finalTipeMakan = 'Bawa Pulang (Take-Away)';
    finalServiceLabel = isOjolActive ? `Mode Ojol (${trimmedRefCode || 'Delivery'})` : 'Bungkus (Take-Away)';
    finalTipePesanan = 'Take-Away';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      tipePesanan: finalTipePesanan,
      tipeMakan: finalTipeMakan,
      tableNumber: finalTable,
      orderType: finalOrderType,
      diningType: diningType,
      isOjol: isOjolActive,
      ojolRefCode: trimmedRefCode,
      customerName: trimmedName || (isOjolActive ? 'Driver Ojol' : (activeType === 'qr' ? 'Pelanggan Meja' : 'Pelanggan')),
      groupName: (activeType === 'takeaway' || activeType === 'qr') ? (trimmedGroup || '-') : (trimmedGroup || '-'),
      phone: normalizedPhone || '-',
      serviceType: finalServiceType,
      serviceLabel: finalServiceLabel,
      reservationTime: trimmedTime || '12:00',
      reservationDate: trimmedDate,
      guestCount: (activeType === 'reservasi') ? (trimmedGuest || '-') : '-',
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
 * Terhubung 100% tanpa merusak Kasir (kasir.html) dan Dapur (dapur.html)
 */
export async function sendOrderToFirestore(orderData) {
  if (!orderData) {
    throw new Error('Data pesanan tidak boleh kosong.');
  }

  let nomorMejaClean = String(orderData.nomorMeja || orderData.tableNumber || '').trim();
  const diningType = orderData.diningType || (orderData.orderType === 'take_away' ? 'take-away' : 'dine-in');

  // Deteksi Tipe Pesanan
  let tipePesanan = String(orderData.tipePesanan || '').trim();
  const isTakeAwayLegacy =
    nomorMejaClean === 'Take-Away' ||
    nomorMejaClean === 'Take-Away (Bungkus)' ||
    Boolean(orderData.isOjol) ||
    orderData.orderType === 'take_away' ||
    orderData.serviceType === 'take-away' ||
    orderData.tipePesanan === 'Take-Away';

  const isQrOrder = Boolean(
    orderData.isQrOrder ||
    tipePesanan === 'PESAN LEWAT QR MEJA' ||
    (!isTakeAwayLegacy && orderData.sourceMode === 'qr') ||
    (!isTakeAwayLegacy && !orderData.isReservasi && orderData.serviceType !== 'reservasi' && !orderData.isOjol)
  );

  let orderType = 'dine_in';
  let serviceType = 'dine-in';
  let tipeMakan = 'Makan di Tempat (Dine-In)';

  if (isQrOrder) {
    tipePesanan = 'PESAN LEWAT QR MEJA';
    if (diningType === 'take-away' || orderData.orderType === 'take_away' || orderData.serviceType === 'take-away') {
      orderType = 'take_away';
      serviceType = 'take-away';
      tipeMakan = 'Bawa Pulang (Take-Away)';
    } else {
      orderType = 'dine_in';
      serviceType = 'dine-in';
      tipeMakan = 'Makan di Tempat (Dine-In)';
    }
    if (!nomorMejaClean || nomorMejaClean === 'Take-Away' || nomorMejaClean === 'Take-Away (Bungkus)') {
      nomorMejaClean = 'Meja 1';
    }
  } else if (tipePesanan === 'Reservasi' || orderData.isReservasi || orderData.serviceType === 'reservasi') {
    tipePesanan = 'Reservasi';
    nomorMejaClean = 'Reservasi Saung';
    orderType = 'dine_in';
    serviceType = 'reservasi';
    tipeMakan = 'Makan di Tempat (Reservasi)';
  } else if (tipePesanan === 'Take-Away' || isTakeAwayLegacy) {
    tipePesanan = 'Take-Away';
    nomorMejaClean = 'Take-Away';
    orderType = 'take_away';
    serviceType = 'take-away';
    tipeMakan = 'Bawa Pulang (Take-Away)';
  }

  const isOjol = Boolean(orderData.isOjol);
  const kodeOjol = String(orderData.kodeOjol || orderData.kodeReferensi || orderData.ojolRefCode || '').trim();

  // Cek apakah meja ini sudah punya pesanan belum lunas di Firestore (isAddon)
  let isAddon = Boolean(orderData.isAddon);
  if (orderData.isAddon === undefined && tipePesanan === 'PESAN LEWAT QR MEJA') {
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

  const namaPemesan = String(orderData.namaPemesan || orderData.customerName || '').trim();
  const namaRombongan = String(orderData.namaRombongan || orderData.groupName || '').trim();
  const nomorWhatsapp = String(orderData.nomorWhatsapp || orderData.phone || orderData.customerPhone || '').trim();
  const catatanKhusus = String(orderData.catatanKhusus || orderData.notes || orderData.customerNotes || '').trim();
  const jamKedatangan = String(orderData.jamKedatangan || orderData.reservationTime || (isQrOrder ? 'Langsung' : '12:00')).trim();
  const jumlahOrang = String(orderData.jumlahOrang || orderData.guestCount || '').trim();
  const tanggalKedatangan = String(orderData.tanggalKedatangan || orderData.reservationDate || '').trim();

  const payload = {
    nomorMeja: nomorMejaClean,
    tipePesanan: tipePesanan,
    orderType: orderType,
    serviceType: serviceType,
    tipeMakan: tipeMakan,
    isOjol: isOjol,
    kodeOjol: isOjol ? kodeOjol : '',
    isAddon: isAddon,
    isQrOrder: isQrOrder,
    items: formattedItems,
    totalHarga: totalHarga,
    status: 'baru',
    kitchenStatus: 'baru',
    paymentStatus: 'belum_lunas',
    paymentMethod: String(orderData.paymentMethod || ''),

    // Semua Informasi Form Pelanggan
    namaPemesan: namaPemesan || (isOjol ? 'Driver Ojol' : (isQrOrder ? 'Pelanggan Meja' : 'Pelanggan')),
    customerName: namaPemesan || (isOjol ? 'Driver Ojol' : (isQrOrder ? 'Pelanggan Meja' : 'Pelanggan')),
    namaRombongan: namaRombongan || '-',
    groupName: namaRombongan || '-',
    nomorWhatsapp: nomorWhatsapp || '-',
    phone: nomorWhatsapp || '-',
    catatanKhusus: catatanKhusus || '-',
    notes: catatanKhusus || '-',
    jamKedatangan: jamKedatangan || '12:00',
    reservationTime: jamKedatangan || '12:00',
    jumlahOrang: jumlahOrang || '-',
    guestCount: jumlahOrang || '-',
    tanggalKedatangan: tanggalKedatangan,
    reservationDate: tanggalKedatangan,

    timestamp: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  if (orderData.takeawayMethod) payload.takeawayMethod = String(orderData.takeawayMethod);
  if (orderData.needHandGlove !== undefined) payload.needHandGlove = Boolean(orderData.needHandGlove);

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
  window.parseUrlTableParam = parseUrlTableParam;
  window.detectAccessSource = detectAccessSource;
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
