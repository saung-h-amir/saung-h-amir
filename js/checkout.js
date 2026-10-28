(function (global) {
  'use strict';

  function getBusinessConfig() {
    return global.BUSINESS_CONFIG || {
      BUSINESS_NAME: 'Saung Haji Amir',
      WHATSAPP_NUMBER: '6281219569995'
    };
  }

  function getFormatRupiah() {
    return global.formatRupiah || function (val) {
      return 'Rp ' + Number(val).toLocaleString('id-ID');
    };
  }

  function normalizePhone(rawPhone) {
    if (typeof rawPhone !== 'string') return '';
    const cleaned = rawPhone.trim().replace(/[\s\-()]/g, '');
    const withoutPlus = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
    return withoutPlus;
  }

  function validateCheckoutForm({
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
    const trimmedName = (customerName || '').trim();
    const trimmedGroup = (groupName || '').trim();
    const trimmedNotes = (notes || '').trim();
    const trimmedGuest = (guestCount || '').trim();
    const normalizedPhone = normalizePhone(phone || '');
    const selectedService = serviceType === 'take-away' ? 'take-away' : 'dine-in';
    const trimmedTime = (reservationTime || '').trim();
    const isHandGloveNeeded = Boolean(needHandGlove);
    const selectedTakeawayMethod = takeawayMethod === 'gosend' ? 'gosend' : 'self-pickup';
    const takeawayMethodText =
      selectedTakeawayMethod === 'gosend'
        ? 'Diambil oleh Kurir Go-Send / GrabExpress'
        : 'Ambil Sendiri Langsung ke Restoran';

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      errors.customerName = 'Nama lengkap harus terdiri dari 2 hingga 80 karakter.';
    }

    const isPhoneDigits = /^\d{8,15}$/.test(normalizedPhone);
    const validPrefix =
      normalizedPhone.startsWith('08') || normalizedPhone.startsWith('62');
    if (!isPhoneDigits || !validPrefix) {
      errors.phone = 'Masukkan nomor WhatsApp 8–15 digit dengan awalan 08 atau 62.';
    }

    if (!trimmedTime) {
      errors.reservationTime = 'Tentukan jam kedatangan / pengambilan (Jam 10.00 - 17.00 WIB).';
    }

    if (selectedService === 'dine-in') {
      if (!trimmedGuest) {
        errors.guestCount = 'Konfirmasi jumlah orang / tamu yang akan datang untuk penyiapan saung.';
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      sanitized: {
        customerName: trimmedName,
        groupName: trimmedGroup || '-',
        phone: normalizedPhone,
        serviceType: selectedService,
        serviceLabel:
          selectedService === 'dine-in'
            ? 'Makan di Tempat (Reservasi Saung Lesehan)'
            : 'Bungkus / Bawa Pulang (Take Away)',
        reservationTime: trimmedTime || '12:00',
        guestCount: trimmedGuest || '-',
        notes: trimmedNotes || '-',
        needHandGlove: isHandGloveNeeded,
        handGloveText: isHandGloveNeeded
          ? 'Ya, perlu sarung tangan plastik'
          : 'Tidak perlu',
        takeawayMethod: selectedTakeawayMethod,
        takeawayMethodText: takeawayMethodText
      }
    };
  }

  function isBusinessWhatsappConfigured() {
    const config = getBusinessConfig();
    return /^\d{8,15}$/.test(config.WHATSAPP_NUMBER);
  }

  function buildWhatsappUrl(summary, sanitizedContact, reservationDate) {
    if (!isBusinessWhatsappConfigured()) return '';
    const config = getBusinessConfig();
    const formatRp = getFormatRupiah();

    const isDineIn = sanitizedContact.serviceType === 'dine-in';

    const lines = [
      `Halo ${config.BUSINESS_NAME}, saya ingin mengajukan ${
        isDineIn ? 'Reservasi Tempat & Pemesanan Menu' : 'Pemesanan Makanan Bungkus (Take Away)'
      }:`,
      '',
      `📌 *Tipe Layanan*: ${sanitizedContact.serviceLabel}`,
      `👤 *Nama Pemesan*: ${sanitizedContact.customerName}`,
      `🏢 *Instansi / Rombongan*: ${sanitizedContact.groupName}`,
      `📱 *Nomor WhatsApp*: ${sanitizedContact.phone}`,
      `📅 *Tanggal*: ${reservationDate}`,
      `⏰ *Jam Kedatangan / Ambil*: ${sanitizedContact.reservationTime} WIB`,
      isDineIn && sanitizedContact.guestCount !== '-'
        ? `👥 *Konfirmasi Jumlah Tamu Datang*: ${sanitizedContact.guestCount}`
        : null,
      !isDineIn ? `📦 *Metode Pengambilan*: ${sanitizedContact.takeawayMethodText}` : null,
      !isDineIn ? `🧤 *Sarung Tangan Plastik*: ${sanitizedContact.handGloveText}` : null,
      '',
      '📋 *Daftar Menu Pesanan*:'
    ].filter(Boolean);

    summary.items.forEach((item, index) => {
      const optionText = item.option ? ` [${item.option}]` : '';
      lines.push(
        `${index + 1}. ${item.name}${optionText} (${item.quantity} porsi x ${formatRp(
          item.unitPrice
        )}) = ${formatRp(item.subtotal)}`
      );
    });

    lines.push(
      '',
      `💰 *Total Estimasi Biaya*: ${formatRp(summary.totalPrice)}`,
      `📝 *Catatan Khusus*: ${sanitizedContact.notes}`,
      '',
      isDineIn
        ? 'Mohon konfirmasi ketersediaan saung lesehan dan kesiapan menu. Terima kasih Saung H. Amir!'
        : 'Mohon konfirmasi bahwa pesanan take away telah dicatat dan dapat disiapkan. Terima kasih!'
    );

    const encodedText = encodeURIComponent(lines.join('\n'));
    return `https://wa.me/${config.WHATSAPP_NUMBER}?text=${encodedText}`;
  }

  global.normalizePhone = normalizePhone;
  global.validateCheckoutForm = validateCheckoutForm;
  global.isBusinessWhatsappConfigured = isBusinessWhatsappConfigured;
  global.buildWhatsappUrl = buildWhatsappUrl;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      normalizePhone,
      validateCheckoutForm,
      isBusinessWhatsappConfigured,
      buildWhatsappUrl
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
