(function (global) {
  const BUSINESS_CONFIG = {
    BUSINESS_NAME: 'Saung Haji Amir',
    TAGLINE: 'Kelezatan Autentik Khas Sunda, Dimasak Dadakan untuk Anda.',
    WHATSAPP_NUMBER: '6281219569995',
    SECONDARY_PHONE: '0812-1956-9995 / 0858-1055-9575',
    OPERATING_HOURS: 'Setiap Hari (10.00 - 17.00 WIB)',
    ADDRESS: 'Cileutik, Jl. Raya Cisauk, Legok, Tangerang - Banten',
    STORAGE_KEY: 'saung-h-amir:cart:v1',
    SCHEMA_VERSION: 1
  };

  global.BUSINESS_CONFIG = BUSINESS_CONFIG;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BUSINESS_CONFIG };
  }
})(typeof window !== 'undefined' ? window : globalThis);
