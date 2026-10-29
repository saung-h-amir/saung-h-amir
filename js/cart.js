(function (global) {
  'use strict';

  const currencyFormatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  });

  function formatRupiah(amount) {
    return currencyFormatter.format(amount);
  }

  function isValidQuantity(value) {
    const num = Number(value);
    return Number.isInteger(num) && num >= 1 && num <= 99;
  }

  function parseDateParts(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return null;
    }
    const [year, month, day] = dateStr.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (
      utcDate.getUTCFullYear() !== year ||
      utcDate.getUTCMonth() !== month - 1 ||
      utcDate.getUTCDate() !== day
    ) {
      return null;
    }
    return { year, month, day, utcTime: utcDate.getTime() };
  }

  function getTodayUtcTime() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function validateReservationDate(dateStr) {
    if (!dateStr) {
      return { valid: false, message: 'Pilih tanggal kedatangan/pengambilan untuk menghitung estimasi.' };
    }
    const parsed = parseDateParts(dateStr);
    if (!parsed) {
      return { valid: false, message: 'Format tanggal tidak valid.' };
    }
    if (parsed.utcTime < getTodayUtcTime()) {
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
      if (typeof customPrice === 'number' && customPrice > 0) {
        newItem.customPrice = customPrice;
      }
      return [...(items || []), newItem];
    }

    return items.map((item, idx) => {
      if (idx !== existingIndex) return item;
      const nextQty = Math.min(99, item.quantity + incrementBy);
      return { ...item, quantity: nextQty };
    });
  }

  function updateItemQuantity(items, productId, nextQuantity, option = '') {
    if (!isValidQuantity(nextQuantity)) {
      return { valid: false, items };
    }
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
          : product.dailyPrice;

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

  global.formatRupiah = formatRupiah;
  global.isValidQuantity = isValidQuantity;
  global.parseDateParts = parseDateParts;
  global.getTodayUtcTime = getTodayUtcTime;
  global.validateReservationDate = validateReservationDate;
  global.addOrIncrementItem = addOrIncrementItem;
  global.updateItemQuantity = updateItemQuantity;
  global.removeItem = removeItem;
  global.calculateCartSummary = calculateCartSummary;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      formatRupiah,
      isValidQuantity,
      parseDateParts,
      getTodayUtcTime,
      validateReservationDate,
      addOrIncrementItem,
      updateItemQuantity,
      removeItem,
      calculateCartSummary
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
