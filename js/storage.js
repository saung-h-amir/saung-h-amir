(function (global) {
  'use strict';

  function getBusinessConfig() {
    return global.BUSINESS_CONFIG || {
      STORAGE_KEY: 'saung-h-amir:cart:v1',
      SCHEMA_VERSION: 1
    };
  }

  function getIsValidQuantity() {
    return global.isValidQuantity || function (v) {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 99;
    };
  }

  function getValidateReservationDate() {
    return global.validateReservationDate || function (d) {
      return { valid: Boolean(d), message: d ? '' : 'Pilih tanggal.' };
    };
  }

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
      const config = getBusinessConfig();
      const raw = window.localStorage.getItem(config.STORAGE_KEY);
      if (!raw) return defaultState;

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== config.SCHEMA_VERSION) {
        window.localStorage.removeItem(config.STORAGE_KEY);
        return defaultState;
      }

      const isValidQty = getIsValidQuantity();
      const validateDate = getValidateReservationDate();
      const validIds = new Set((catalog || []).map((p) => p.id));
      const sanitizedItems = [];

      if (Array.isArray(parsed.items)) {
        for (const entry of parsed.items) {
          if (
            entry &&
            typeof entry.productId === 'string' &&
            validIds.has(entry.productId) &&
            isValidQty(entry.quantity)
          ) {
            const itemData = {
              productId: entry.productId,
              quantity: Number(entry.quantity),
              option: typeof entry.option === 'string' ? entry.option : ''
            };
            if (typeof entry.customPrice === 'number' && entry.customPrice > 0) {
              itemData.customPrice = entry.customPrice;
            }
            sanitizedItems.push(itemData);
          }
        }
      }

      let reservationDate = '';
      let expiredDateCleared = false;
      if (typeof parsed.reservationDate === 'string' && parsed.reservationDate) {
        const check = validateDate(parsed.reservationDate);
        if (check.valid) {
          reservationDate = parsed.reservationDate;
        } else {
          expiredDateCleared = true;
        }
      }

      const serviceType = parsed.serviceType === 'take-away' ? 'take-away' : 'dine-in';
      const reservationTime =
        typeof parsed.reservationTime === 'string' && parsed.reservationTime
          ? parsed.reservationTime
          : '12:00';
      const needHandGlove = Boolean(parsed.needHandGlove);
      const takeawayMethod = parsed.takeawayMethod === 'gosend' ? 'gosend' : 'self-pickup';
      const tableNumber = typeof parsed.tableNumber === 'string' ? parsed.tableNumber : '';
      const isOjol = Boolean(parsed.isOjol);
      const ojolRefCode = typeof parsed.ojolRefCode === 'string' ? parsed.ojolRefCode : '';

      return {
        items: sanitizedItems,
        reservationDate,
        serviceType,
        reservationTime,
        needHandGlove,
        takeawayMethod,
        tableNumber,
        isOjol,
        ojolRefCode,
        storageAvailable: true,
        expiredDateCleared
      };
    } catch {
      return { ...defaultState, storageAvailable: false };
    }
  }

  function saveCartDraft(
    items,
    reservationDate,
    serviceType = 'dine-in',
    reservationTime = '12:00',
    needHandGlove = false,
    takeawayMethod = 'self-pickup',
    tableNumber = '',
    isOjol = false,
    ojolRefCode = ''
  ) {
    try {
      const config = getBusinessConfig();
      const payload = {
        schemaVersion: config.SCHEMA_VERSION,
        items: (items || []).map((item) => {
          const out = {
            productId: item.productId,
            quantity: item.quantity,
            option: item.option || ''
          };
          if (typeof item.customPrice === 'number' && item.customPrice > 0) {
            out.customPrice = item.customPrice;
          }
          return out;
        }),
        reservationDate: reservationDate || '',
        serviceType: serviceType || 'dine-in',
        reservationTime: reservationTime || '12:00',
        needHandGlove: Boolean(needHandGlove),
        takeawayMethod: takeawayMethod === 'gosend' ? 'gosend' : 'self-pickup',
        tableNumber: tableNumber || '',
        isOjol: Boolean(isOjol),
        ojolRefCode: ojolRefCode || ''
      };
      window.localStorage.setItem(config.STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  global.loadCartDraft = loadCartDraft;
  global.saveCartDraft = saveCartDraft;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadCartDraft, saveCartDraft };
  }
})(typeof window !== 'undefined' ? window : globalThis);
