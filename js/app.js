(function (global) {
  'use strict';

  function initApp() {
    const MAIN_TABS = global.MAIN_TABS || [];
    const CATEGORIES = global.CATEGORIES || [];
    const PRODUCTS = global.PRODUCTS || [];
    const formatRupiah = global.formatRupiah || ((n) => 'Rp ' + Number(n).toLocaleString('id-ID'));
    const addOrIncrementItem = global.addOrIncrementItem;
    const updateItemQuantity = global.updateItemQuantity;
    const removeItem = global.removeItem;
    const calculateCartSummary = global.calculateCartSummary;
    const validateReservationDate = global.validateReservationDate;
    const loadCartDraft = global.loadCartDraft;
    const saveCartDraft = global.saveCartDraft;
    const validateCheckoutForm = global.validateCheckoutForm;
    const buildWhatsappUrl = global.buildWhatsappUrl;
    const isBusinessWhatsappConfigured = global.isBusinessWhatsappConfigured;

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
      customerNameInput: document.getElementById('customer-name'),
      nameError: document.getElementById('name-error'),
      groupNameInput: document.getElementById('group-name'),
      phoneInput: document.getElementById('customer-phone'),
      phoneError: document.getElementById('phone-error'),
      notesInput: document.getElementById('customer-notes'),
      reviewPanel: document.getElementById('review-panel'),
      reviewDetails: document.getElementById('review-details'),
      editOrderBtn: document.getElementById('edit-order-btn'),
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
      modalAddBtn: document.getElementById('modal-add-btn')
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
          state.takeawayMethod
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

      return PRODUCTS.filter((product) => {
        // Tab Filtering
        let matchesTab = false;
        if (state.activeTab === 'berlima') {
          matchesTab = product.type === 'package';
        } else if (state.activeTab === 'minuman') {
          matchesTab = product.type === 'drink';
        } else if (state.activeTab === 'sambal') {
          matchesTab = product.type === 'sambal';
        } else {
          // 'makanan' tab: includes all food
          matchesTab = product.type === 'food';
        }

        // Subcategory Filtering
        let matchesCategory = true;
        if (state.selectedCategory !== 'Semua' && !state.selectedCategory.startsWith('Semua')) {
          if (state.activeTab === 'minuman') {
            if (state.selectedCategory === 'Jus Buah Segar') {
              matchesCategory = product.name.toLowerCase().includes('jus');
            } else if (state.selectedCategory === 'Es & Jeruk Segar') {
              matchesCategory =
                product.name.toLowerCase().includes('es') ||
                product.name.toLowerCase().includes('jeruk');
            } else if (state.selectedCategory === 'Teh & Kopi') {
              matchesCategory =
                product.name.toLowerCase().includes('teh') ||
                product.name.toLowerCase().includes('kopi') ||
                product.name.toLowerCase().includes('mineral');
            }
          } else {
            matchesCategory = product.category === state.selectedCategory;
          }
        }

        // Search Query Filtering
        const matchesSearch =
          !query ||
          product.name.toLowerCase().includes(query) ||
          product.description.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query);

        return matchesTab && matchesCategory && matchesSearch;
      });
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

      let modalPrice = product.dailyPrice;

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
          const currentPrice = modalPackageState.isLiwet
            ? product.dailyPrice + (product.packageConfig.nasiUpgradePrice || 10000)
            : product.dailyPrice;
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
        price.textContent = `${formatRupiah(product.dailyPrice)}`;

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
            price.textContent = `${formatRupiah(currentPrice)}`;
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
      const summary = calculateCartSummary(state.items, PRODUCTS, state.reservationDate);
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

    function renderReviewSummary(summary, sanitizedContact) {
      if (!elements.reviewDetails) return;
      elements.reviewDetails.textContent = '';

      const list = document.createElement('dl');
      list.className = 'review-list';

      const entries = [
        ['Tipe Layanan', sanitizedContact.serviceLabel],
        ['Nama Pemesan', sanitizedContact.customerName],
        ['Instansi / Rombongan', sanitizedContact.groupName],
        ['Nomor WhatsApp', sanitizedContact.phone],
        ['Tanggal Pesanan', state.reservationDate],
        ['Jam Kedatangan / Ambil', `${sanitizedContact.reservationTime} WIB`],
        sanitizedContact.serviceType === 'dine-in'
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
            .map((i) => `${i.name}${i.option ? ` [${i.option}]` : ''} (${i.quantity}x)`)
            .join(', ')
        ],
        ['Total Estimasi Biaya', formatRupiah(summary.totalPrice)],
        ['Catatan Khusus', sanitizedContact.notes]
      ].filter(Boolean);

      entries.forEach(([term, desc]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = desc;
        list.append(dt, dd);
      });

      elements.reviewDetails.appendChild(list);

      if (isBusinessWhatsappConfigured && isBusinessWhatsappConfigured()) {
        const url = buildWhatsappUrl(summary, sanitizedContact, state.reservationDate);
        if (elements.whatsappLink) {
          elements.whatsappLink.href = url;
          elements.whatsappLink.hidden = false;
        }
        if (elements.configWarning) elements.configWarning.hidden = true;
      } else {
        if (elements.whatsappLink) elements.whatsappLink.hidden = true;
        if (elements.configWarning) elements.configWarning.hidden = false;
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

      if (elements.serviceTypeDineIn) {
        elements.serviceTypeDineIn.addEventListener('change', () => {
          if (elements.serviceTypeDineIn.checked) {
            state.serviceType = 'dine-in';
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
        elements.reservationDateInput.addEventListener('change', (e) => {
          state.reservationDate = e.target.value;
          const check = validateReservationDate(state.reservationDate);
          setFieldError(
            elements.reservationDateInput,
            elements.dateError,
            check.valid ? '' : check.message
          );
          invalidateReview();
          persistState();
          renderCart();
        });
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
          const summary = calculateCartSummary(state.items, PRODUCTS, state.reservationDate);

          if (summary.items.length === 0) {
            announceStatus('Keranjang pesanan masih kosong. Pilih minimal 1 menu terlebih dahulu.');
            if (elements.searchInput) elements.searchInput.focus();
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
            announceStatus(dateCheck.message);
            if (elements.reservationDateInput) elements.reservationDateInput.focus();
            return;
          }

          if (!formValidation.valid) {
            announceStatus('Periksa kembali data pemesanan yang belum lengkap atau belum valid.');
            if (formValidation.errors.customerName && elements.customerNameInput) {
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

          renderReviewSummary(summary, formValidation.sanitized);
          announceStatus('Pesanan siap ditinjau. Klik tombol WhatsApp untuk mengirim pesanan.');
        });
      }

      if (elements.editOrderBtn) {
        elements.editOrderBtn.addEventListener('click', () => {
          invalidateReview();
          if (elements.customerNameInput) elements.customerNameInput.focus();
          announceStatus('Pesanan dapat diedit. Perbarui data atau keranjang, lalu tinjau kembali.');
        });
      }

      [
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
        elements.floatingOrderBar.addEventListener('click', (e) => {
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

      if (elements.reservationDateInput) {
        const today = new Date().toISOString().split('T')[0];
        elements.reservationDateInput.min = today;
        if (state.reservationDate) {
          elements.reservationDateInput.value = state.reservationDate;
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
    global.addSpecificItem = function (productId, option = '') {
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

    global.selectCatalogTab = function (tabId) {
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

    renderTabs();
    renderCategories();
    renderCatalog();
    renderCart();
    initEvents();
  }

  // Jalankan ketika DOM sudah siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})(typeof window !== 'undefined' ? window : globalThis);
