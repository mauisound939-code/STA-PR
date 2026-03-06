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
    objective: 'empezar',
    budget: 300,
    categories: [],
    preferred: [],
    categoriesMap: {},
    selectedPlan: null,
    loading: false,
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
  var ROOT_ID = 'socia-test-root';
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
      id: product.id,
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

  async function fetchCategoriesMap() {
    var offset = 0;
    var limit = 100;
    var all = [];

    while (true) {
      var response = await fetchStorefront('categories', { offset: offset, limit: limit });
      var items = Array.isArray(response && response.items) ? response.items : [];
      all = all.concat(items);
      if (items.length < limit) break;
      offset += limit;
    }

    var map = {};
    var wanted = CATEGORY_NAMES.map(norm);

    all.forEach(function (cat) {
      if (!cat || !cat.name) return;

      var normalized = norm(cat.name);
      var idx = wanted.indexOf(normalized);

      if (idx >= 0) {
        map[CATEGORY_NAMES[idx]] = cat.id;
      }
    });

    console.log('[SOCIA] Categorías totales:', all.length);
    console.log('[SOCIA] Map encontrado:', map);

    return map;
  }

  async function fetchProductsByCategory(categoryId) {
    var offset = 0;
    var limit = 100;
    var allProducts = [];

    while (true) {
      var response = await fetchStorefront('products', {
        categoryId: categoryId,
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
    return (products || [])
      // DEBUG TEMP: bypass SOCIA attribute gate to validate recommendation flow
      .filter(function (p) { return !hasVariants(p); })
      .filter(isInStock)
      .map(function (p) { return normalizeProduct(p, categoryName); })
      .filter(function (p) { return p.price > 0; })
      .sort(function (a, b) { return a.price - b.price; });
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
    return plan;
  }

  async function buildRecommendation() {
    var totalBudget = Math.max(300, asNumber(STATE.budget));
    var selectedCats = STATE.categories.slice();
    var preferred = STATE.preferred.slice();

    if (!selectedCats.length) {
      throw new Error('Selecciona al menos una categoría.');
    }

    var catMap = STATE.categoriesMap;
    var eligibleByCategory = {};

    for (var i = 0; i < selectedCats.length; i += 1) {
      var name = selectedCats[i];
      var categoryId = catMap[name];
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
      budget: totalBudget
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
    style.textContent = '\n      #' + ROOT_ID + ' { position: fixed; z-index: 2147483000; font-family: Arial, sans-serif; }\n      #' + LAUNCHER_ID + ' { position: fixed; right: 16px; bottom: 16px; background:#111; color:#fff; border:none; border-radius:999px; padding:10px 14px; font-size:12px; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,.25); }\n      #' + MODAL_ID + ' { position: fixed; inset: 0; background: rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; padding:16px; }\n      #' + MODAL_ID + '.open { display:flex; }\n      #socia-card { width:min(760px,95vw); max-height:90vh; overflow:auto; background:#fff; border-radius:12px; padding:16px; box-shadow:0 10px 30px rgba(0,0,0,.3); }\n      .socia-row { display:flex; gap:10px; flex-wrap:wrap; }\n      .socia-btn { border:1px solid #ccc; background:#fff; padding:8px 10px; border-radius:8px; cursor:pointer; }\n      .socia-btn[disabled] { opacity:.55; cursor:not-allowed; }\n      .socia-btn.primary { background:#111; color:#fff; border-color:#111; }\n      .socia-btn.selected { border-color:#111; background:#f1f1f1; }\n      .socia-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }\n      .socia-item { border:1px solid #eee; border-radius:8px; padding:8px; display:flex; gap:8px; align-items:center; }\n      .socia-item img { width:44px; height:44px; object-fit:cover; border-radius:6px; background:#f5f5f5; }\n      .socia-muted { color:#666; font-size:12px; }\n      .socia-error { color:#b00020; margin-top:8px; }\n      .socia-notice { color:#0b6a0b; margin-top:8px; font-size:13px; }\n      .socia-step { margin:10px 0 14px; font-size:12px; color:#666; }\n    ';

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
      setLoading(true, '');
      STATE.selectedPlan = await buildRecommendation();
      STATE.step = 5;
      setLoading(false, '');
    } catch (err) {
      setLoading(false, err && err.message ? err.message : 'Error al generar recomendación');
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

  async function addAllToCart() {
    if (!STATE.selectedPlan) return;

    var products = [];
    Object.keys(STATE.selectedPlan.byCategory).forEach(function (cat) {
      STATE.selectedPlan.byCategory[cat].items.forEach(function (p) {
        products.push(p);
      });
    });

    if (!products.length) return;

    var addedCount = 0;
    var skippedCount = 0;

    for (var i = 0; i < products.length; i += 1) {
      var success = await addOneProductToCart(products[i].id);
      if (success) addedCount += 1;
      else skippedCount += 1;
    }

    if (skippedCount > 0) {
      STATE.notice = 'Omitimos ' + skippedCount + ' pieza(s) por falta de stock.';
    } else {
      STATE.notice = '';
    }

    if (addedCount > 0 && window.Ecwid && typeof window.Ecwid.openPage === 'function') {
      window.Ecwid.openPage('cart');
    }

    render();
  }

  function wizardHtml() {
    var disabledNext2 = asNumber(STATE.budget) < 300;
    var disabledNext3 = STATE.categories.length < 1;

    if (STATE.step === 1) {
      return '\n        <h3>SOCIA (modo prueba)</h3>\n        <p>Te ayudamos a surtir sin rebasar tu presupuesto.</p>\n        <div class="socia-step">Paso 1 de 4 · Objetivo</div>\n        <div class="socia-row">\n          <button class="socia-btn ' + (STATE.objective === 'empezar' ? 'selected' : '') + '" data-action="set-objective" data-value="empezar">Empezar</button>\n          <button class="socia-btn ' + (STATE.objective === 'surtir' ? 'selected' : '') + '" data-action="set-objective" data-value="surtir">Surtir</button>\n        </div>\n        <div class="socia-row" style="margin-top:14px">\n          <button class="socia-btn" data-action="close">Cerrar</button>\n          <button class="socia-btn primary" data-action="go" data-step="2">Continuar</button>\n        </div>\n      ';
    }

    if (STATE.step === 2) {
      return '\n        <h3>¿Cuál es tu presupuesto?</h3>\n        <div class="socia-step">Paso 2 de 4 · Presupuesto mínimo $300</div>\n        <input id="socia-budget-input" type="number" min="300" step="1" value="' + asNumber(STATE.budget) + '" style="padding:8px;border:1px solid #ccc;border-radius:8px;width:220px">\n        <div class="socia-row" style="margin-top:14px">\n          <button class="socia-btn" data-action="go" data-step="1">Atrás</button>\n          <button class="socia-btn primary" ' + (disabledNext2 ? 'disabled' : '') + ' data-action="go" data-step="3">Continuar</button>\n        </div>\n      ';
    }

    if (STATE.step === 3) {
      var cats = CATEGORY_NAMES.map(function (cat) {
        return '<button class="socia-btn ' + (STATE.categories.indexOf(cat) >= 0 ? 'selected' : '') + '" data-action="toggle-category" data-value="' + cat + '">' + cat + '</button>';
      }).join('');

      return '\n        <h3>Elige categorías (1 a 4)</h3>\n        <div class="socia-step">Paso 3 de 4 · Solo productos SOCIA=SAFE</div>\n        <div class="socia-row">' + cats + '</div>\n        <div class="socia-row" style="margin-top:14px">\n          <button class="socia-btn" data-action="go" data-step="2">Atrás</button>\n          <button class="socia-btn primary" ' + (disabledNext3 ? 'disabled' : '') + ' data-action="go" data-step="4">Continuar</button>\n        </div>\n      ';
    }

    if (STATE.step === 4) {
      var pref = STATE.categories.map(function (cat) {
        return '<button class="socia-btn ' + (STATE.preferred.indexOf(cat) >= 0 ? 'selected' : '') + '" data-action="toggle-preferred" data-value="' + cat + '">' + cat + '</button>';
      }).join('');

      return '\n        <h3>Opcional: Quiero más de…</h3>\n        <div class="socia-step">Paso 4 de 4 · Elige hasta 2 categorías</div>\n        <div class="socia-row">' + pref + '</div>\n        <div class="socia-row" style="margin-top:14px">\n          <button class="socia-btn" data-action="go" data-step="3">Atrás</button>\n          <button class="socia-btn primary" data-action="run">Generar recomendación</button>\n        </div>\n      ';
    }

    var plan = STATE.selectedPlan;
    var categories = plan ? Object.keys(plan.byCategory) : [];

    var list = categories.map(function (cat) {
      var block = plan.byCategory[cat];
      var items = block.items.map(function (p) {
        return '<div class="socia-item"><img src="' + (p.image || '') + '" alt=""><div><div>' + p.name + '</div><div class="socia-muted">' + money(p.price) + '</div></div></div>';
      }).join('');
      return '<h4>' + cat + ' · Subtotal: ' + money(block.subtotal) + '</h4><div class="socia-grid">' + (items || '<div class="socia-muted">Sin productos elegibles.</div>') + '</div>';
    }).join('');

    return '\n      <h3>Tu propuesta SOCIA</h3>\n      <div class="socia-muted">Total recomendado: ' + money(plan ? plan.total : 0) + ' de ' + money(plan ? plan.budget : 0) + '</div>\n      <div style="margin-top:10px">' + list + '</div>\n      <div class="socia-row" style="margin-top:14px">\n        <button class="socia-btn" data-action="reset">Volver y ajustar</button>\n        <button class="socia-btn primary" data-action="add-all">Agregar todo al carrito</button>\n      </div>\n    ';
  }

  function render() {
    ensureStyle();
    ensureRoot();

    var card = document.getElementById('socia-card');
    if (!card) return;

    var body = STATE.loading ? '<h3>Generando recomendación…</h3>' : wizardHtml();
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
      } else if (action === 'set-objective') {
        STATE.objective = target.getAttribute('data-value') || 'empezar';
        render();
      } else if (action === 'toggle-category') {
        toggleFromList('categories', target.getAttribute('data-value'), 4);
      } else if (action === 'toggle-preferred') {
        toggleFromList('preferred', target.getAttribute('data-value'), 2);
      } else if (action === 'run') {
        runRecommendation();
      } else if (action === 'reset') {
        STATE.step = 1;
        STATE.selectedPlan = null;
        STATE.error = '';
        STATE.notice = '';
        render();
      } else if (action === 'add-all') {
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
