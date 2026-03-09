/*
  SOCIA Level 1 helper for Ecwid Instant Site.

  HOW TO INSTALL (Ecwid Custom Code):
  1) Paste this entire file in your Ecwid Instant Site custom JavaScript area.
  2) Save/publish.

  HOW TO TEST:
  - Normal mode (NO effect): https://your-site.com/
  - Test mode (enabled):      https://your-site.com/?socia_test=1

  IMPORTANT:
  - This script exits immediately unless URL contains ?socia_test=1.
  - In normal mode it does NOT inject UI, observers, or modify the page.

  DATA SOURCE NOTE (SAFE APPROACH):
  - Catalog read uses Ecwid Storefront REST endpoints with a READ-ONLY public token.
  - Public storefront tokens are intended for client-side catalog reads (no admin write access).
  - DO NOT use private admin tokens in storefront JavaScript.
*/
(function sociaHelper() {
  'use strict';

  var TEST_FLAG = 'socia_test';
  var TEST_VALUE = '1';

  var SOCIA_CONFIG = {
    storeId: 129803252,
    publicToken: 'public_QVEjWwFVEcKwNKzynPYEkHMCpYWK1XD9',
    apiBase: 'https://app.ecwid.com/api/v3'
  };

  function isTestMode() {
    try {
      var url = new URL(window.location.href);
      return url.searchParams.get(TEST_FLAG) === TEST_VALUE;
    } catch (e) {
      return false;
    }
  }

  if (!isTestMode()) {
    return;
  }

  var STATE = {
    step: 1,
    budget: 300,
    categories: [],
    preferred: [],
    categoriesMap: {},
    selectedPlan: null,
    loading: false,
    addingToCart: false,
    error: '',
    notice: '',
    storeContext: null
  };

  var CATEGORY_NAMES = [
    'Anillos - Plata .925',
    'Pulseras y Tobilleras - Plata .925',
    'Dijes - Plata .925',
    'Aretes - Plata .925'
  ];
  var SOCIA_SAFE_CATEGORY_MAP = {
    'Anillos - Plata .925': 197304783,
    'Pulseras y Tobilleras - Plata .925': 197304784,
    'Dijes - Plata .925': 197315521,
    'Aretes - Plata .925': 197303538
  };
  var CATEGORY_DISPLAY_MAP = {
    'Anillos - Plata .925': 'Anillos',
    'Pulseras y Tobilleras - Plata .925': 'Pulseras',
    'Dijes - Plata .925': 'Dijes',
    'Aretes - Plata .925': 'Aretes'
  };
  var ROOT_ID = 'socia-test-root';
  var WHOLESALE_DISCOUNT_MULTIPLIER = 2;
  var LAUNCHER_WRAP_ID = 'socia-launcher-wrap';
  var LAUNCHER_MASCOT_ID = 'socia-launcher-mascot';
  var LAUNCHER_ID = 'socia-test-launcher';
  var MODAL_ID = 'socia-test-modal';
  var STYLE_ID = 'socia-test-style';

  function onEcwidReady(cb) {
    function attach() {
      if (window.Ecwid && window.Ecwid.OnAPILoaded && typeof window.Ecwid.OnAPILoaded.add === 'function') {
        window.Ecwid.OnAPILoaded.add(function () {
          cb();
        });
        return true;
      }
      return false;
    }

    if (attach()) return;

    var timer = setInterval(function () {
      if (attach()) {
        clearInterval(timer);
      }
    }, 300);
  }

  function asNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function detectStoreId() {
    if (asNumber(SOCIA_CONFIG.storeId) > 0) return asNumber(SOCIA_CONFIG.storeId);

    if (window.Ecwid && typeof window.Ecwid.getOwnerId === 'function') {
      var byApi = asNumber(window.Ecwid.getOwnerId());
      if (byApi > 0) return byApi;
    }

    var script = document.querySelector('script[src*="app.ecwid.com/script.js?"]');
    if (script && script.src) {
      var match = script.src.match(/script\.js\?(\d+)/);
      if (match && match[1]) return asNumber(match[1]);
    }

    return 0;
  }

  function detectPublicToken() {
    var configuredToken = SOCIA_CONFIG.publicToken ? String(SOCIA_CONFIG.publicToken).trim() : '';
    var isPlaceholder = configuredToken === 'public_REPLACE_WITH_REAL_TOKEN';
    if (configuredToken && !isPlaceholder) return configuredToken;

    var candidates = [
      window.ecwid_public_token,
      window.ECWID_PUBLIC_TOKEN,
      window.__ECWID_PUBLIC_TOKEN__,
      window.ec && window.ec.storefront && window.ec.storefront.publicToken,
      window.Ecwid && typeof window.Ecwid.getStorefrontToken === 'function' ? window.Ecwid.getStorefrontToken() : ''
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var token = candidates[i];
      if (token && String(token).trim()) return String(token).trim();
    }

    var meta = document.querySelector('meta[name="ecwid-storefront-token"], meta[name="ec-storefront-token"]');
    if (meta && meta.content) return String(meta.content).trim();

    var scriptWithToken = document.querySelector('script[data-storefront-token], script[data-token]');
    if (scriptWithToken) {
      var dataToken = scriptWithToken.getAttribute('data-storefront-token') || scriptWithToken.getAttribute('data-token');
      if (dataToken && String(dataToken).trim()) return String(dataToken).trim();
    }

    var inlineScripts = document.querySelectorAll('script:not([src])');
    for (var j = 0; j < inlineScripts.length; j += 1) {
      var text = inlineScripts[j].textContent || '';
      var match = text.match(/public_[A-Za-z0-9_-]+/);
      if (match && match[0]) return match[0];
    }

    return '';
  }

  function resolveStoreContext() {
    var configuredStoreId = asNumber(SOCIA_CONFIG.storeId);
    var configuredToken = SOCIA_CONFIG.publicToken ? String(SOCIA_CONFIG.publicToken).trim() : '';

    if (configuredStoreId > 0 && configuredToken) {
      return {
        storeId: configuredStoreId,
        token: configuredToken,
        apiBase: SOCIA_CONFIG.apiBase || 'https://app.ecwid.com/api/v3'
      };
    }

    var storeId = detectStoreId();
    var token = detectPublicToken();

    if (!storeId || !token) {
      throw new Error(
        'No encontramos credenciales de catálogo. Configura SOCIA_CONFIG.storeId y SOCIA_CONFIG.publicToken (token público de storefront, solo lectura).'
      );
    }

    return {
      storeId: storeId,
      token: token,
      apiBase: SOCIA_CONFIG.apiBase || 'https://app.ecwid.com/api/v3'
    };
  }

  async function fetchStorefront(path, params) {
    var ctx = STATE.storeContext;
    if (!ctx) {
      throw new Error('Contexto de tienda no disponible.');
    }

    var query = new URLSearchParams();
    Object.keys(params || {}).forEach(function (key) {
      if (key === 'token') return;
      if (params[key] !== undefined && params[key] !== null) {
        query.set(key, String(params[key]));
      }
    });

    var baseUrl = ctx.apiBase.replace(/\/$/, '') + '/' + ctx.storeId + '/' + path.replace(/^\//, '');
    var url = baseUrl + '?' + query.toString();
    console.log('[SOCIA] API URL (Bearer):', url);

    var response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        Authorization: 'Bearer ' + ctx.token,
        Accept: 'application/json'
      }
    });

    var bodyText = await response.text();
    console.log('[SOCIA] API status (Bearer):', response.status);
    console.log('[SOCIA] API body (Bearer):', bodyText);

    if (!response.ok) {
      throw new Error('Error al leer catálogo de Ecwid (' + response.status + ').');
    }

    try {
      return bodyText ? JSON.parse(bodyText) : {};
    } catch (_) {
      throw new Error('Respuesta inválida de Ecwid API.');
    }
  }

  function isSociaSafe(product) {
    var attrs = product && product.attributes;
    if (!Array.isArray(attrs)) return false;
    return attrs.some(function (attr) {
      if (!attr) return false;
      var name = String(attr.name || '').trim().toUpperCase();
      var value = String(attr.value || '').trim().toUpperCase();
      return name === 'SOCIA' && value === 'SAFE';
    });
  }

  function hasVariants(product) {
    var hasOptions = Array.isArray(product.options) && product.options.length > 0;
    var hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
    return hasOptions || hasVariations;
  }

  function isEnabled(product) {
    return product && product.enabled === true;
  }

  function isInStock(product) {
    var unlimited = product && (product.unlimited === true || product.unlimitedInStock === true);
    var quantity = asNumber(product && (product.quantity !== undefined ? product.quantity : product.stock));
    return isEnabled(product) && (unlimited || quantity > 0);
  }

  function priceOf(product) {
    return asNumber(product && (product.price !== undefined ? product.price : product.defaultDisplayedPrice));
  }

  function normalizeProduct(product, categoryName) {
    var image = '';
    if (product && product.thumbnailUrl) {
      image = product.thumbnailUrl;
    } else if (product && product.imageUrl) {
      image = product.imageUrl;
    } else if (product && Array.isArray(product.galleryImages) && product.galleryImages[0]) {
      image = product.galleryImages[0].url || '';
    }

    return {
      id: Number(product.id || product.productId),
      name: product.name || 'Producto sin nombre',
      price: priceOf(product),
      category: categoryName,
      image: image
    };
  }

  function norm(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function shuffle(array) {
    var arr = array.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  function sortByPriceThenShuffleInBuckets(products, bucketSize) {
    var sorted = (products || []).slice().sort(function (a, b) {
      return a.price - b.price;
    });

    var result = [];
    var size = Math.max(2, Number(bucketSize) || 3);

    for (var i = 0; i < sorted.length; i += size) {
      var bucket = sorted.slice(i, i + size);
      var mixed = shuffle(bucket);
      result = result.concat(mixed);
    }

    return result;
  }

  function resolveSafeCategoryId(categoryName) {
    var normalized = norm(categoryName);
    if (normalized.indexOf('anillos') >= 0) return 197304783;
    if (normalized.indexOf('pulseras') >= 0 || normalized.indexOf('tobilleras') >= 0) return 197304784;
    if (normalized.indexOf('dijes') >= 0) return 197315521;
    if (normalized.indexOf('aretes') >= 0) return 197303538;
    return 0;
  }

  async function fetchCategoriesMap() {
    var map = {};
    CATEGORY_NAMES.forEach(function (name) {
      if (SOCIA_SAFE_CATEGORY_MAP[name]) {
        map[name] = SOCIA_SAFE_CATEGORY_MAP[name];
      }
    });

    console.log('[SOCIA] Categorías totales:', Object.keys(map).length);
    console.log('[SOCIA] Map encontrado:', map);

    return map;
  }

  async function fetchProductsByCategory(categoryId) {
    var offset = 0;
    var limit = 100;
    var allProducts = [];

    while (true) {
      var response = await fetchStorefront('products', {
        category: categoryId,
        enabled: true,
        offset: offset,
        limit: limit
      });

      var items = Array.isArray(response && response.items) ? response.items : [];
      allProducts = allProducts.concat(items);
      if (items.length < limit) break;
      offset += limit;
    }

    return allProducts;
  }

  function eligibleProducts(products, categoryName) {
    var priced = (products || [])
      // DEBUG TEMP: bypass SOCIA attribute gate to validate recommendation flow
      .filter(function (p) { return !hasVariants(p); })
      .filter(isInStock)
      .map(function (p) { return normalizeProduct(p, categoryName); })
      .filter(function (p) { return p.price > 0; });

    return sortByPriceThenShuffleInBuckets(priced, 3);
  }

  function allocateBudgets(totalBudget, categories, preferred) {
    var n = categories.length;
    var base = totalBudget / n;
    var alloc = {};

    categories.forEach(function (cat) {
      alloc[cat] = base;
    });

    var preferredValid = (preferred || []).filter(function (cat) {
      return categories.indexOf(cat) >= 0;
    });

    if (preferredValid.length === 0) {
      return alloc;
    }

    var increment = 0;
    preferredValid.forEach(function (cat) {
      var plus = base * 0.2;
      alloc[cat] += plus;
      increment += plus;
    });

    var nonPreferred = categories.filter(function (cat) {
      return preferredValid.indexOf(cat) === -1;
    });

    if (!nonPreferred.length) {
      return alloc;
    }

    var currentNonPreferredTotal = nonPreferred.reduce(function (sum, cat) {
      return sum + alloc[cat];
    }, 0);

    if (currentNonPreferredTotal <= 0) {
      return alloc;
    }

    nonPreferred.forEach(function (cat) {
      var share = alloc[cat] / currentNonPreferredTotal;
      alloc[cat] = Math.max(0, alloc[cat] - increment * share);
    });

    return alloc;
  }

  function pickWithinBudget(sortedProducts, categoryBudget) {
    var picked = [];
    var subtotal = 0;

    (sortedProducts || []).forEach(function (product) {
      if ((subtotal + product.price) <= categoryBudget) {
        picked.push(product);
        subtotal += product.price;
      }
    });

    return { items: picked, subtotal: subtotal };
  }

  function fillRemainingGlobal(plan, totalBudget) {
    var selectedIds = new Set();
    var globalTotal = 0;

    Object.keys(plan.byCategory).forEach(function (cat) {
      plan.byCategory[cat].items.forEach(function (p) {
        selectedIds.add(String(p.id));
      });
      globalTotal += plan.byCategory[cat].subtotal;
    });

    var fillerPool = [];
    Object.keys(plan.eligibleByCategory).forEach(function (cat) {
      plan.eligibleByCategory[cat].forEach(function (p) {
        if (!selectedIds.has(String(p.id))) {
          fillerPool.push(p);
        }
      });
    });

    fillerPool.sort(function (a, b) { return a.price - b.price; });

    var added = true;
    while (added) {
      added = false;
      for (var i = 0; i < fillerPool.length; i += 1) {
        var candidate = fillerPool[i];
        if (selectedIds.has(String(candidate.id))) continue;
        if ((globalTotal + candidate.price) <= totalBudget) {
          plan.byCategory[candidate.category].items.push(candidate);
          plan.byCategory[candidate.category].subtotal += candidate.price;
          selectedIds.add(String(candidate.id));
          globalTotal += candidate.price;
          added = true;
        }
      }
    }

    plan.total = globalTotal;
    plan.estimatedFinalTotal = plan.total / WHOLESALE_DISCOUNT_MULTIPLIER;
    return plan;
  }

  async function buildRecommendation() {
    var finalBudget = asNumber(STATE.budget);
    var totalBudget = finalBudget * WHOLESALE_DISCOUNT_MULTIPLIER;
    var selectedCats = STATE.categories.slice();
    var preferred = STATE.preferred.slice();

    if (!selectedCats.length) {
      throw new Error('Selecciona al menos una categoría.');
    }

    var eligibleByCategory = {};

    for (var i = 0; i < selectedCats.length; i += 1) {
      var name = selectedCats[i];
      var categoryId = resolveSafeCategoryId(name);
      console.log('[SOCIA] categoria:', name, '-> id:', categoryId);
      if (!categoryId) {
        eligibleByCategory[name] = [];
        console.log('[SOCIA] productos en', name, ':', 0);
        console.log('[SOCIA] elegibles en', name, ':', eligibleByCategory[name].length);
        continue;
      }
      var products = await fetchProductsByCategory(categoryId);
      console.log('[SOCIA] productos en', name, ':', products.length);
      eligibleByCategory[name] = eligibleProducts(products, name);
      console.log('[SOCIA] elegibles en', name, ':', eligibleByCategory[name].length);
    }

    var allocation = allocateBudgets(totalBudget, selectedCats, preferred);
    var byCategory = {};

    selectedCats.forEach(function (cat) {
      byCategory[cat] = pickWithinBudget(eligibleByCategory[cat], allocation[cat]);
    });

    var plan = {
      byCategory: byCategory,
      eligibleByCategory: eligibleByCategory,
      total: 0,
      budget: totalBudget,
      finalBudget: finalBudget,
      estimatedFinalTotal: 0
    };

    return fillRemainingGlobal(plan, totalBudget);
  }

  function money(value) {
    try {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
    } catch (e) {
      return '$' + asNumber(value).toFixed(2);
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + ROOT_ID + ' { position: fixed; z-index: 2147483000; font-family: Arial, sans-serif; }',
      '#' + LAUNCHER_WRAP_ID + ' { position: fixed; right: 18px; bottom: 18px; z-index: 2147483001; display:flex; flex-direction:column; align-items:center; }',
      '#' + LAUNCHER_MASCOT_ID + ' { width:78px; max-width:78px; height:auto; display:block; margin-bottom:-8px; transform:rotate(-6deg); pointer-events:none; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.12)); }',
      '#' + LAUNCHER_ID + ' { background:#6687a7; color:#fff; border:none; border-radius:16px; padding:14px 18px 12px; min-width:220px; box-shadow:0 10px 24px rgba(0,0,0,0.16); cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; animation:sociaPulse 3.2s ease-in-out infinite; }',
      '#' + LAUNCHER_ID + ':hover { background:#5b7994; }',
      '.socia-launcher-title { font-size:17px; font-weight:700; line-height:1.2; }',
      '.socia-launcher-sub { font-size:13px; font-weight:400; line-height:1.2; opacity:.95; }',
      '#' + MODAL_ID + ' { position: fixed; inset: 0; background: rgba(17,26,36,.36); display:none; align-items:center; justify-content:center; padding:16px; }',
      '#' + MODAL_ID + '.open { display:flex; }',
      '#socia-card { width:min(900px,96vw); max-height:92vh; overflow:auto; background:#fff; border-radius:22px; padding:30px; box-shadow:0 16px 40px rgba(30,41,59,.18); }',
      '.socia-brand-header { text-align:center; padding:10px 10px 6px; margin-bottom:8px; border-bottom:1px solid #e8eef3; }',
      '.socia-brand-image { width:120px; max-width:120px; height:auto; object-fit:contain; display:block; margin:0 auto 6px; }',
      '.socia-brand-name { font-size:14px; letter-spacing:3px; color:#6687a7; font-weight:700; margin-bottom:2px; }',
      '.socia-brand-copy { font-size:15px; color:#6c7480; margin-bottom:6px; }',
      '.socia-row { display:flex; gap:12px; flex-wrap:wrap; }',
      '.socia-btn { border:1px solid #dbe4ec; background:#fff; color:#1a1a1a; padding:14px 22px; border-radius:14px; cursor:pointer; min-height:54px; font-size:17px; font-weight:600; transition:.18s ease; }',
      '.socia-btn:hover { transform:translateY(-1px); }',
      '.socia-btn[disabled] { opacity:.55; cursor:not-allowed; }',
      '.socia-btn.primary { background:#6687a7; color:#fff; border-color:#6687a7; box-shadow:0 8px 18px rgba(102,135,167,.28); }',
      '.socia-btn.primary:hover { background:#55728e; border-color:#55728e; }',
      '.socia-btn.selected { border-color:#6687a7; background:#eef3f7; box-shadow:inset 0 0 0 1px #6687a7; }',
      '.socia-grid { display:flex; flex-direction:column; gap:12px; }',
      '.socia-item { border:1px solid #dbe4ec; border-radius:16px; padding:14px; display:flex; gap:14px; align-items:center; background:#fff; box-shadow:0 4px 10px rgba(26,26,26,.04); }',
      '.socia-item img { width:72px; height:72px; object-fit:cover; border-radius:12px; background:#eef3f7; }',
      '.socia-product-name { font-size:18px; line-height:1.35; color:#1a1a1a; }',
      '.socia-product-price { font-size:18px; font-weight:700; color:#6687a7; margin-top:4px; }',
      '.socia-muted { color:#6c7480; font-size:15px; line-height:1.45; }',
      '.socia-error { color:#b00020; margin-top:10px; font-size:15px; }',
      '.socia-notice { color:#0b6a0b; margin-top:10px; font-size:15px; }',
      '#socia-card h3 { margin:0 0 10px; font-size:34px; line-height:1.1; letter-spacing:-.02em; color:#1a1a1a; }',
      '#socia-card p { margin:0 0 14px; line-height:1.5; font-size:18px; }',
      '.socia-btn.chip { padding:10px 14px; min-height:40px; font-size:16px; }',
      '.socia-card-option { border:1.5px solid #dbe4ec; border-radius:14px; padding:18px 20px; min-width:210px; text-align:left; font-size:18px; font-weight:600; }',
      '.socia-step { margin:10px 0 14px; font-size:18px; color:#495361; }',
      '.socia-trust-block { background:#f7fafc; border:1px solid #dbe4ec; border-radius:16px; padding:16px 18px; margin:8px 0 16px; }',
      '.socia-trust-title { font-size:27px; line-height:1.2; font-weight:700; color:#1a1a1a; margin:0 0 6px; }',
      '.socia-trust-copy { font-size:15px; color:#6c7480; }',
      '.socia-summary { background:#eef3f7; border:1px solid #dbe4ec; border-radius:18px; padding:18px 20px; margin:18px 0 18px; }',
      '.socia-summary-label { font-size:15px; color:#4a5563; }',
      '.socia-summary-total { font-size:44px; line-height:1.05; font-weight:800; color:#1a1a1a; margin:8px 0; }',
      '.socia-summary-helper { font-size:15px; color:#4a5563; }',
      '.socia-summary-secondary { font-size:15px; color:#6c7480; margin-top:8px; }',
      '.socia-summary-note { font-size:13px; color:#8b95a2; margin-top:8px; }',
      '.socia-category-block { margin-top:20px; padding-top:16px; border-top:1px solid #e7edf3; }',
      '.socia-category-title { margin:0 0 4px; font-size:22px; color:#1a1a1a; }',
      '.socia-cta { margin-top:24px; display:flex; gap:12px; flex-wrap:wrap; }',
      '.socia-progress { height:6px; width:100%; border-radius:999px; background:#eef3f7; overflow:hidden; margin:8px 0 18px; }',
      '.socia-progress-bar { height:100%; border-radius:999px; background:#6687a7; width:0%; transition:width .2s ease; }',
      '@keyframes sociaPulse { 0% { transform:scale(1); box-shadow:0 10px 24px rgba(0,0,0,0.16); } 50% { transform:scale(1.03); box-shadow:0 14px 28px rgba(0,0,0,0.20); } 100% { transform:scale(1); box-shadow:0 10px 24px rgba(0,0,0,0.16); } }',
      '@media (max-width: 640px) { #socia-card { padding:20px; border-radius:18px; } #socia-card h3 { font-size:30px; } .socia-brand-image { width:120px; max-width:120px; } #' + LAUNCHER_WRAP_ID + ' { right:12px; bottom:12px; } #' + LAUNCHER_MASCOT_ID + ' { width:64px; max-width:64px; margin-bottom:-6px; } #' + LAUNCHER_ID + ' { min-width:190px; padding:12px 14px 10px; } .socia-launcher-title { font-size:15px; } .socia-launcher-sub { font-size:12px; } .socia-btn { width:100%; justify-content:center; } .socia-card-option { width:100%; min-width:0; } .socia-summary-total { font-size:40px; } }'
    ].join('\n');

    document.head.appendChild(style);
  }

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '\n      <button id="' + LAUNCHER_ID + '">SOCIA TEST</button>\n      <div id="' + MODAL_ID + '">\n        <div id="socia-card"></div>\n      </div>\n    ';

    document.body.appendChild(root);
    return root;
  }

  function toggleModal(open) {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    if (open) modal.classList.add('open');
    else modal.classList.remove('open');
  }

  function setLoading(loading, error) {
    STATE.loading = !!loading;
    STATE.error = error || '';
    render();
  }

  function toggleFromList(listName, value, max) {
    var arr = STATE[listName] || [];
    var idx = arr.indexOf(value);

    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      if (max && arr.length >= max) return;
      arr.push(value);
    }

    STATE[listName] = arr;
    render();
  }

  function goStep(step) {
    STATE.step = step;
    render();
  }

  async function runRecommendation() {
    try {
      STATE.notice = '';
      STATE.error = '';
      STATE.loading = true;
      STATE.step = 5;
      render();
      STATE.selectedPlan = await buildRecommendation();
      STATE.step = 6;
      STATE.loading = false;
      render();
    } catch (err) {
      STATE.loading = false;
      STATE.error = err && err.message ? err.message : 'Error al generar recomendación';
      render();
    }
  }

  function addOneProductToCart(productId) {
    return new Promise(function (resolve) {
      try {
        if (!window.Ecwid || !window.Ecwid.Cart || typeof window.Ecwid.Cart.addProduct !== 'function') {
          resolve(false);
          return;
        }

        window.Ecwid.Cart.addProduct({ id: productId, quantity: 1 }, function (success) {
          resolve(!!success);
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function addProductsSequentially(products) {
    for (var i = 0; i < products.length; i += 1) {
      await new Promise(function (resolve, reject) {
        var item = products[i];

        if (!window.Ecwid || !window.Ecwid.Cart || typeof window.Ecwid.Cart.addProduct !== 'function') {
          reject(new Error('Ecwid Cart API not ready'));
          return;
        }

        window.Ecwid.Cart.addProduct({
          id: Number(item.id),
          quantity: Number(item.quantity || 1),
          callback: function (success, product, cart, error) {
            console.log('[SOCIA] addProduct result:', {
              requestedId: item.id,
              success: success,
              product: product,
              error: error
            });

            if (success) {
              resolve();
            } else {
              reject(new Error(error || ('Failed to add product ' + item.id)));
            }
          }
        });
      });
    }
  }

  async function addAllToCart() {
    if (!STATE.selectedPlan) return;

    var products = [];

    Object.keys(STATE.selectedPlan.byCategory).forEach(function(cat) {
      STATE.selectedPlan.byCategory[cat].items.forEach(function(p) {
        products.push({
          id: Number(p.id),
          quantity: 1
        });
      });
    });

    if (!products.length) return;

    STATE.addingToCart = true;
    STATE.error = '';
    STATE.notice = '';
    render();

    console.log('SOCIA adding products:', products);

    try {
      await addProductsSequentially(products);
      setTimeout(function () {
        window.location.href = 'https://sociajoyeria.com/products/cart';
      }, 500);
    } catch (err) {
      console.error('[SOCIA] addAllToCart error:', err);
      STATE.addingToCart = false;
      STATE.error = err && err.message ? err.message : 'No se pudieron agregar todos los productos al carrito.';
      render();
    }
  }


  function brandHeaderHtml() {
    return '\n      <div class="socia-brand-header">\n        <img class="socia-brand-image" src="https://i.postimg.cc/1XDvfpYP/LOGOTIPO-Y-MASCOTA-(1).png" alt="SOCIA">\n        <div class="socia-brand-name">SOCIA</div>\n        <div class="socia-brand-copy">Te ayudamos a armar tu surtido</div>\n      </div>\n    ';
  }

  function progressHtml() {
    var step = Math.min(6, Math.max(1, asNumber(STATE.step) || 1));
    var pct = Math.round((step / 6) * 100);
    return '<div class="socia-progress"><div class="socia-progress-bar" style="width:' + pct + '%"></div></div>';
  }

  function wizardHtml() {
    if (STATE.addingToCart) {
      return brandHeaderHtml() + progressHtml() + '\n  <h3>¡Estamos armando tu pedido!</h3>\n  <div class="socia-step">Por favor, espera un momento...</div>\n  <div class="socia-muted">Estamos agregando tus productos al carrito.</div>\n  <div style="margin-top:14px">⏳</div>\n';
    }
    if (STATE.loading || STATE.step === 5) {
      return brandHeaderHtml() + progressHtml() + '\n        <h3>Estamos armando tu surtido...</h3>\n        <div class="socia-step">Espera un momento.</div>\n        <div style="margin-top:14px">⏳</div>\n      ';
    }

    var budgetValid = asNumber(STATE.budget) > 0;
    var hasCategories = STATE.categories.length > 0;

    if (STATE.step === 1) {
      return brandHeaderHtml() + progressHtml() + '\n        <h3>Arma tu surtido ideal</h3>\n        <p>Elige las categorías que te interesan, escribe tu presupuesto y te mostraremos una propuesta lista para agregar al carrito.</p>\n        <div class="socia-row" style="margin-top:18px">\n          <button class="socia-btn" data-action="close">Cerrar</button>\n          <button class="socia-btn primary" data-action="go" data-step="2">Quiero surtirme</button>\n        </div>\n      ';
    }

    if (STATE.step === 2) {
      var cats = CATEGORY_NAMES.map(function (cat) {
        var label = CATEGORY_DISPLAY_MAP[cat] || cat;
        return '<button class="socia-btn socia-card-option ' + (STATE.categories.indexOf(cat) >= 0 ? 'selected' : '') + '" data-action="toggle-category" data-value="' + cat + '">' + label + '</button>';
      }).join('');

      return brandHeaderHtml() + progressHtml() + '\n        <h3>¿Qué quieres vender?</h3>\n        <div class="socia-step">Elige una o varias categorías.</div>\n        <div class="socia-row">' + cats + '</div>\n        <div class="socia-row" style="margin-top:18px">\n          <button class="socia-btn" data-action="go" data-step="1">Atrás</button>\n          <button class="socia-btn primary" ' + (hasCategories ? '' : 'disabled') + ' data-action="go" data-step="3">Continuar</button>\n        </div>\n      ';
    }

    if (STATE.step === 3) {
      return brandHeaderHtml() + progressHtml() + '\n        <h3>¿Cuánto quieres invertir?</h3>\n        <div class="socia-step">Escribe cuánto quieres pagar en total.</div>\n        <div class="socia-muted">Tu descuento de mayoreo ya está contemplado.</div>\n        <input id="socia-budget-input" type="number" min="1" step="1" placeholder="Ej. 300" value="' + asNumber(STATE.budget) + '" style="padding:10px;border:1px solid #ccc;border-radius:10px;width:220px;font-size:15px">\n        <div class="socia-row" style="margin-top:10px">\n          <button class="socia-btn chip" data-action="set-budget" data-value="300">$300</button>\n          <button class="socia-btn chip" data-action="set-budget" data-value="500">$500</button>\n          <button class="socia-btn chip" data-action="set-budget" data-value="1000">$1000</button>\n        </div>\n        <div class="socia-row" style="margin-top:18px">\n          <button class="socia-btn" data-action="go" data-step="2">Atrás</button>\n          <button class="socia-btn primary" ' + (budgetValid ? '' : 'disabled') + ' data-action="go" data-step="4">Continuar</button>\n        </div>\n      ';
    }

    if (STATE.step === 4) {
      var pref = STATE.categories.map(function (cat) {
        var label = CATEGORY_DISPLAY_MAP[cat] || cat;
        return '<button class="socia-btn socia-card-option ' + (STATE.preferred.indexOf(cat) >= 0 ? 'selected' : '') + '" data-action="toggle-preferred" data-value="' + cat + '">' + label + '</button>';
      }).join('');

      return brandHeaderHtml() + progressHtml() + '\n        <h3>¿Quieres más de algo?</h3>\n        <div class="socia-step">Opcional. Elige hasta 2.</div>\n        <div class="socia-row">' + pref + '</div>\n        <div class="socia-row" style="margin-top:18px">\n          <button class="socia-btn" data-action="go" data-step="3">Atrás</button>\n          <button class="socia-btn" data-action="skip-priority">Saltar</button>\n          <button class="socia-btn primary" data-action="run">Ver mi propuesta</button>\n        </div>\n      ';
    }

    var plan = STATE.selectedPlan;
    var categories = plan ? Object.keys(plan.byCategory) : [];

    var list = categories.map(function (cat) {
      var block = plan.byCategory[cat];
      var items = block.items.map(function (p) {
        return '<div class="socia-item"><img src="' + (p.image || '') + '" alt=""><div><div class="socia-product-name">' + p.name + '</div><div class="socia-product-price">' + money(p.price) + '</div></div></div>';
      }).join('');
      var label = CATEGORY_DISPLAY_MAP[cat] || cat;
      return '<div class="socia-category-block"><h4 class="socia-category-title">' + label + '</h4><div class="socia-muted">Subtotal: ' + money(block.subtotal) + '</div><div class="socia-grid" style="margin-top:10px">' + (items || '<div class="socia-muted">Sin productos elegibles.</div>') + '</div></div>';
    }).join('');

    return brandHeaderHtml() + progressHtml() + '\n      <div class="socia-trust-block">\n        <div class="socia-trust-title">Tu pedido ya está armado</div>\n        <div class="socia-trust-copy">Ya consideramos tu descuento de mayoreo para calcular tu surtido.</div>\n      </div>\n      <h3>Este es tu surtido recomendado para vender</h3>\n      <div class="socia-step">Listo para agregar a tu carrito.</div>\n      <div class="socia-summary">\n        <div class="socia-summary-label">Tu compra aproximada</div>\n        <div class="socia-summary-total">' + money(plan ? plan.estimatedFinalTotal : 0) + '</div>\n        <div class="socia-summary-helper">con tu descuento de mayoreo</div>\n        <div class="socia-summary-secondary">Precio normal en tienda: ' + money(plan ? plan.total : 0) + '</div>\n        <div class="socia-summary-note">Puede variar un poco al finalizar tu pedido.</div>\n      </div>\n      <div style="margin-top:12px">' + list + '</div>\n      <div class="socia-cta">\n        <button class="socia-btn primary" data-action="add-all">🛒 Agregar todo a mi carrito</button>\n        <button class="socia-btn" data-action="reset">Ajustar mi selección</button>\n      </div>\n    ';
  }

  function render() {
    ensureStyle();
    ensureRoot();

    var card = document.getElementById('socia-card');
    if (!card) return;

    var body = wizardHtml();
    if (STATE.error) body += '<div class="socia-error">' + STATE.error + '</div>';
    if (STATE.notice) body += '<div class="socia-notice">' + STATE.notice + '</div>';

    card.innerHTML = body;

    var budgetInput = document.getElementById('socia-budget-input');
    if (budgetInput) {
      budgetInput.addEventListener('input', function () {
        STATE.budget = asNumber(budgetInput.value);
      });
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target) return;

      if (target.id === LAUNCHER_ID) {
        toggleModal(true);
        return;
      }

      var action = target.getAttribute('data-action');
      if (!action) {
        if (target.id === MODAL_ID) toggleModal(false);
        return;
      }

      if (action === 'close') {
        toggleModal(false);
      } else if (action === 'go') {
        goStep(asNumber(target.getAttribute('data-step')));
      } else if (action === 'toggle-category') {
        toggleFromList('categories', target.getAttribute('data-value'), 4);
      } else if (action === 'toggle-preferred') {
        toggleFromList('preferred', target.getAttribute('data-value'), 2);
      } else if (action === 'set-budget') {
        STATE.budget = asNumber(target.getAttribute('data-value'));
        render();
      } else if (action === 'run' || action === 'skip-priority') {
        runRecommendation();
      } else if (action === 'reset') {
        STATE.step = 1;
        STATE.selectedPlan = null;
        STATE.error = '';
        STATE.notice = '';
        render();
      } else if (action === 'add-all') {
        if (STATE.addingToCart === true) return;
        addAllToCart();
      }
    });
  }

  function keepMountedInTestMode() {
    var observer = new MutationObserver(function () {
      if (!document.getElementById(ROOT_ID) && document.body) {
        render();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function initSOCIA() {
    try {
      STATE.storeContext = resolveStoreContext();
      STATE.categoriesMap = await fetchCategoriesMap();
    } catch (e) {
      STATE.categoriesMap = {};
      STATE.error = e && e.message ? e.message : 'No fue posible inicializar SOCIA.';
    }

    bindEvents();
    render();
    keepMountedInTestMode();
  }

  if (window.Ecwid && window.Ecwid.OnAPILoaded) {
    window.Ecwid.OnAPILoaded.add(function () {
      initSOCIA();
    });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(initSOCIA, 500);
    });
  }
})();
