

'use strict';



// Live product data — populated by loadProductFromApi
var PRODUCT = {
  id:        '',
  name:      '',
  brand:     '',
  price:     0,
  rrp:       0,
  stockQty:  0,
  condition: '',
  sku:       '',
  seller:    '',
};

// Mutable selection state
var selectedQty    = 1;
var selectedColour = '';
var wishlisted     = false;



document.addEventListener('DOMContentLoaded', async function () {
  // Must init session FIRST before any function that calls lue_isLoggedIn()
  if (window.lue_initSession) await lue_initSession();
  if (window.lue_syncHeader)  lue_syncHeader();
  syncCartBadge();

  // Load real product from API
  var listingId = sessionStorage.getItem('viewingListingId');

  // If no listingId in session, try URL param ?id=xxx
  if (!listingId) {
    var urlParams = new URLSearchParams(window.location.search);
    listingId = urlParams.get('id') || urlParams.get('listing_id') || '';
  }

  if (listingId) {
    await loadProductFromApi(listingId);
  } else {
    // No listing ID — show a helpful message instead of dummy data
    var titleEl = document.getElementById('product-title');
    if (titleEl) titleEl.textContent = 'No product selected';
    var descEl = document.getElementById('product-description');
    if (descEl) descEl.textContent = 'Please go back to the store and click a product to view it.';
  }

  initGallery();
  initStarSelector();
  var _lid = sessionStorage.getItem('viewingListingId') || new URLSearchParams(window.location.search).get('id') || '';
  initQuantitySelector();
  initAddToCart();
  initBuyNow();
  initDetailTabs();
  initSellButton();
});

/* Load real product from API */
async function loadProductFromApi(listingId) {
  try {
    // Use lue_apiUrl from auth.js for correct path resolution
    var url = (window.lue_apiUrl ? lue_apiUrl('products') : '../api/products.php')
              + '?action=one&id=' + encodeURIComponent(listingId);

    var res  = await fetch(url, { credentials: 'same-origin' });
    var text = await res.text();

    var data;
    try { data = JSON.parse(text); }
    catch(e) { console.warn('products.php returned non-JSON:', text.substring(0, 300)); return; }

    if (!data.ok || !data.data) {
      console.warn('API error:', data.error);
      // Show user-friendly message for deleted/missing listings
      var titleEl = document.getElementById('product-title');
      if (titleEl) titleEl.textContent = 'Product no longer available';
      var descEl = document.getElementById('product-description');
      if (descEl) descEl.textContent = 'This listing may have been removed by the seller.';
      var priceEl = document.getElementById('product-price');
      if (priceEl) priceEl.textContent = '';
      var addBtn = document.querySelector('.btn-add-cart');
      var buyBtn = document.querySelector('.btn-buy-now');
      if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Unavailable'; addBtn.style.background = 'var(--gray-200)'; addBtn.style.color = 'var(--gray-500)'; }
      if (buyBtn) { buyBtn.disabled = true; buyBtn.style.opacity = '0.4'; }
      return;
    }

    var p = data.data;

    // Set helper — always updates even when val is 0
    var set = function(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = (val !== null && val !== undefined && val !== '') ? String(val) : '—';
    };

    set('product-brand',       (p.brand || '').toUpperCase());
    set('product-title',       p.name || 'Untitled Product');
    set('product-description', p.description || 'No description available.');
    set('product-price',       'R ' + Number(p.price || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 }));
    set('product-seller',      p.seller_name || 'Unknown Seller');

    // Seller avatar — first two letters of store name
    var avatarEl = document.getElementById('seller-avatar');
    if (avatarEl && p.seller_name) {
      var words = p.seller_name.trim().split(' ');
      avatarEl.textContent = words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : p.seller_name.substring(0, 2).toUpperCase();
    }

    // Seller meta
    var ratingEl = document.getElementById('seller-rating-display');
    if (ratingEl) ratingEl.textContent = p.seller_rating ? ('⭐ ' + p.seller_rating + ' seller rating') : '';
    var phoneEl = document.getElementById('seller-phone-display');
    if (phoneEl && p.seller_phone) phoneEl.textContent = '📞 ' + p.seller_phone;
    set('product-condition',   p.condition ? p.condition.replace(/_/g,' ') : 'New');
    set('product-sku',         p.sku || '—');
    set('product-model',       p.model_number || '—');
    set('product-brand-spec',  p.brand || '—');
    var stockQty = p.stock_qty != null ? Number(p.stock_qty) : 0;
    set('product-stock-count', stockQty);
    set('product-stock',       stockQty);

    // Show Out of Stock state
    var addCartBtn = document.querySelector('.btn-add-cart');
    var buyNowBtn  = document.querySelector('.btn-buy-now');
    var stockLabel = document.querySelector('.stock-status');

    if (stockQty <= 0 || p.status === 'out_of_stock') {
      if (addCartBtn) { addCartBtn.disabled = true; addCartBtn.textContent = 'Out of Stock'; addCartBtn.style.background = 'var(--gray-200)'; addCartBtn.style.color = 'var(--gray-500)'; addCartBtn.style.cursor = 'not-allowed'; }
      if (buyNowBtn)  { buyNowBtn.disabled  = true; buyNowBtn.style.opacity = '0.4'; buyNowBtn.style.cursor = 'not-allowed'; }
      if (stockLabel) { stockLabel.textContent = 'Out of Stock'; stockLabel.style.color = 'var(--red, #C0392B)'; }
      // Add out-of-stock badge near title
      var titleEl = document.getElementById('product-title');
      if (titleEl && !document.getElementById('oos-badge')) {
        var badge = document.createElement('span');
        badge.id = 'oos-badge';
        badge.textContent = 'Out of Stock';
        badge.style.cssText = 'display:inline-block;margin-left:10px;background:#C0392B;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;vertical-align:middle;text-transform:uppercase;letter-spacing:.5px;';
        titleEl.appendChild(badge);
      }
    } else {
      if (addCartBtn) { addCartBtn.disabled = false; }
      if (buyNowBtn)  { buyNowBtn.disabled  = false; }
    }
    set('product-warranty',    p.warranty  || 'No warranty info');
    set('breadcrumb-title',    p.name      || 'Product Details');

    document.title = (p.name || 'Product') + ' – LinkUp Express';

    // Show listing image if available
    var imgEl   = document.getElementById('product-main-image');
    var emojiEl = document.getElementById('main-emoji');
    if (p.image_urls) {
      var images = [];
      try { images = JSON.parse(p.image_urls); } catch(e) {
        if (typeof p.image_urls === 'string' && p.image_urls.startsWith('data:')) {
          images = [p.image_urls];
        }
      }
      if (images.length > 0 && imgEl) {
        imgEl.src = images[0];
        imgEl.style.display = 'block';
        if (emojiEl) emojiEl.style.display = 'none';
      }
    }

    // Update the live PRODUCT object so Add to Cart uses real data
    PRODUCT.id       = listingId;
    PRODUCT.name     = p.name     || '';
    PRODUCT.brand    = p.brand    || '';
    PRODUCT.price    = p.price    || 0;
    PRODUCT.rrp      = p.rrp      || 0;
    PRODUCT.stockQty = p.stock_qty || 0;
    PRODUCT.condition = p.condition || '';
    PRODUCT.sku      = p.sku      || '';
    PRODUCT.seller   = p.seller_name || '';

    sessionStorage.setItem('viewingProduct', JSON.stringify({
      id: listingId, name: p.name, price: p.price, brand: p.brand
    }));

    console.log('✓ Product loaded:', p.name, '| Price: R' + p.price);

  } catch(e) {
    console.warn('loadProductFromApi error:', e.message);
  }
}


function syncCartBadge() {
  const count = lue_getCart().reduce(function (s, i) { return s + (i.quantity || 1); }, 0);
  const badge = document.getElementById('cart-count');
  if (badge) {
    badge.textContent   = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}


var _selectedRating = 0;

function initStarSelector() {
  var stars = document.querySelectorAll('#star-selector span');
  stars.forEach(function(star) {
    star.addEventListener('mouseover', function() {
      var val = parseInt(star.getAttribute('data-val'));
      stars.forEach(function(s) {
        s.style.color = parseInt(s.getAttribute('data-val')) <= val ? '#F5C518' : 'var(--gray-200)';
      });
    });
    star.addEventListener('mouseleave', function() {
      stars.forEach(function(s) {
        s.style.color = parseInt(s.getAttribute('data-val')) <= _selectedRating ? '#F5C518' : 'var(--gray-200)';
      });
    });
    star.addEventListener('click', function() {
      _selectedRating = parseInt(star.getAttribute('data-val'));
      stars.forEach(function(s) {
        s.style.color = parseInt(s.getAttribute('data-val')) <= _selectedRating ? '#F5C518' : 'var(--gray-200)';
      });
    });
  });
}


function initGallery() {
  document.querySelectorAll('.thumb').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      switchThumb(thumb);
    });
    // Keyboard navigation
    thumb.setAttribute('tabindex', '0');
    thumb.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchThumb(thumb); }
    });
  });
}

/**
 * Switch the main product image to match the clicked thumbnail.
 * @param {HTMLElement} el - the clicked thumbnail element
 */
function switchThumb(el) {
  // Deactivate all thumbs
  document.querySelectorAll('.thumb').forEach(function (t) { t.classList.remove('active'); });
  el.classList.add('active');

  // Update the main display emoji from the thumb's text content
  const emoji = el.textContent.trim();
  const mainEmoji = document.getElementById('main-emoji');
  if (mainEmoji) {
    // Brief scale animation
    mainEmoji.style.transform = 'scale(0.85)';
    mainEmoji.style.opacity   = '0.5';
    setTimeout(function () {
      mainEmoji.textContent     = emoji;
      mainEmoji.style.transform = 'scale(1)';
      mainEmoji.style.opacity   = '1';
    }, 120);
  }
}

// Expose for inline onclick="setThumb(this, '🎧')" in the HTML
window.setThumb = function (el, emoji) {
  document.querySelectorAll('.thumb').forEach(function (t) { t.classList.remove('active'); });
  el.classList.add('active');
  const mainEmoji = document.getElementById('main-emoji');
  if (mainEmoji) {
    mainEmoji.style.transform = 'scale(0.85)';
    mainEmoji.style.opacity   = '0.5';
    setTimeout(function () {
      mainEmoji.textContent     = emoji;
      mainEmoji.style.transform = 'scale(1)';
      mainEmoji.style.opacity   = '1';
    }, 120);
  }
};



function initColourSwatches() {
  document.querySelectorAll('.color-swatch').forEach(function (swatch) {
    swatch.setAttribute('tabindex', '0');
    swatch.setAttribute('role', 'radio');
    swatch.addEventListener('click', function () { pickColour(swatch); });
    swatch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickColour(swatch); }
    });
  });
}

function pickColour(swatch) {
  document.querySelectorAll('.color-swatch').forEach(function (s) {
    s.classList.remove('active');
    s.setAttribute('aria-checked', 'false');
  });
  swatch.classList.add('active');
  swatch.setAttribute('aria-checked', 'true');

  selectedColour = swatch.getAttribute('title') || 'Default';

  // Update the inline colour label in the option-label text
  const colourLabel = document.querySelector('.option-label strong');
  if (colourLabel) colourLabel.textContent = selectedColour;
}

// Expose for inline onclick="selectColor(this, 'Midnight Black')"
window.selectColor = function (el, name) {
  pickColour(el);
  selectedColour = name;
};



function initQuantitySelector() {
  // The qty buttons use inline onclick="changeQty(-1/+1)" — expose them
}

/**
 * Change the selected quantity.
 * @param {number} delta  +1 or -1
 */
function changeQty(delta) {
  var maxQty  = PRODUCT.stockQty > 0 ? PRODUCT.stockQty : 999;
  selectedQty = Math.max(1, Math.min(maxQty, selectedQty + delta));
  const display = document.getElementById('qty-val');
  if (display) display.textContent = selectedQty;

  // Disable the minus button at 1
  const minusBtns = document.querySelectorAll('.qty-btn');
  minusBtns.forEach(function (btn) {
    if (btn.textContent.trim() === '−') {
      btn.disabled      = selectedQty <= 1;
      btn.style.opacity = selectedQty <= 1 ? '0.4' : '1';
    }
    if (btn.textContent.trim() === '+') {
      btn.disabled      = selectedQty >= PRODUCT.stockQty;
      btn.style.opacity = selectedQty >= PRODUCT.stockQty ? '0.4' : '1';
    }
  });
}
window.changeQty = changeQty;



function initAddToCart() {
  const btn = document.querySelector('.btn-add-cart');
  if (btn) {
    btn.addEventListener('click', function () { handleAddToCart(); });
  }
}

async function handleAddToCart() {
  if (!PRODUCT.id) { showProductToast('Product not loaded yet — please wait.'); return; }

  // ── Stock validation ──────────────────────────────────────────
  var cart     = lue_getCart();
  var existing = cart.find(function(i) { return i.id === PRODUCT.id; });
  var alreadyInCart = existing ? (existing.quantity || 0) : 0;
  var totalWanted   = alreadyInCart + selectedQty;

  if (PRODUCT.stockQty > 0 && totalWanted > PRODUCT.stockQty) {
    var canAdd = PRODUCT.stockQty - alreadyInCart;
    if (canAdd <= 0) {
      showProductToast('You already have the maximum stock in your cart.', 'error');
    } else {
      showProductToast('Only ' + PRODUCT.stockQty + ' available. You can add ' + canAdd + ' more.', 'error');
    }
    return;
  }

  var item = {
    id:         PRODUCT.id,
    listing_id: PRODUCT.id,
    name:       PRODUCT.name,
    brand:      PRODUCT.brand,
    price:      PRODUCT.price,
    quantity:   selectedQty,
    sku:        PRODUCT.sku,
    seller:     PRODUCT.seller,
  };

  // ── Save to localStorage ──────────────────────────────────────
  if (existing) {
    existing.quantity = alreadyInCart + selectedQty;
    lue_saveCart(cart);
  } else {
    lue_addToCart(item);
  }

  // ── Save to PHP DB cart ───────────────────────────────────────
  var uid = localStorage.getItem('lue_uid') || '';
  if (uid && window.lue_apiUrl && PRODUCT.id) {
    fetch(lue_apiUrl('cart') + '?action=add&user_id=' + encodeURIComponent(uid), {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ user_id: uid, listing_id: PRODUCT.id, quantity: selectedQty })
    }).then(function(r) { return r.json(); })
      .then(function(d) { if (!d.ok) console.warn('DB cart add:', d.error); })
      .catch(function(e) { console.warn('Cart API:', e.message); });
  }

  syncCartBadge();
  showProductToast(selectedQty + '× ' + PRODUCT.name.split(' ').slice(0,3).join(' ') + ' added to cart!');
  animateAddToCartBtn();
}

function animateAddToCartBtn() {
  const btn = document.querySelector('.btn-add-cart');
  if (!btn) return;
  const orig = btn.innerHTML;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
    <polyline points="20 6 9 17 4 12"/>
  </svg> Added to Cart!`;
  btn.style.background = 'var(--green)';
  btn.style.color      = 'var(--white)';
  setTimeout(function () {
    btn.innerHTML        = orig;
    btn.style.background = '';
    btn.style.color      = '';
  }, 2000);
}

// Expose for inline onclick="addToCart()"
window.addToCart = function () { handleAddToCart(); };



function initBuyNow() {
  const btn = document.querySelector('.btn-buy-now');
  if (!btn) return;
  btn.addEventListener('click', function () {
    if (!lue_isLoggedIn()) {
      lue_toast('Please sign in to complete your purchase.', 'info');
      setTimeout(function () { window.location.href = 'signup.html#login'; }, 1200);
      return;
    }
    // Add to cart then go to cart page
    handleAddToCart();
    setTimeout(function () { window.location.href = 'cart.html'; }, 400);
  });
}



function initWishlistButton() {
  const btn = document.getElementById('wishlist-btn');
  if (!btn) return;
  btn.addEventListener('click', function () { handleWishlistToggle(); });
}

function restoreWishlistState() {
  // If this product is already wishlisted, show the filled heart
  const wishlistItemId = PRODUCT.id;
  wishlisted = lue_isWishlisted(wishlistItemId);
  updateHeartIcon(wishlisted);
}

function handleWishlistToggle() {
  const wishlistItem = {
    id:    PRODUCT.id,
    name:  PRODUCT.name,
    price: PRODUCT.price,
    brand: PRODUCT.brand,
  };
  wishlisted = lue_toggleWishlist(wishlistItem);
  updateHeartIcon(wishlisted);
  showProductToast(wishlisted ? 'Saved to wishlist!' : 'Removed from wishlist.');
}

function updateHeartIcon(isFilled) {
  const heart = document.querySelector('#wishlist-btn path');
  if (!heart) return;
  heart.setAttribute('fill',   isFilled ? '#C0392B' : 'none');
  heart.setAttribute('stroke', isFilled ? '#C0392B' : 'currentColor');
}

// Expose for inline onclick="toggleWishlist()"
window.toggleWishlist = function () { handleWishlistToggle(); };



function initDetailTabs() {
  document.querySelectorAll('.detail-tab-btn').forEach(function (btn, index) {
    btn.setAttribute('role', 'tab');
    btn.setAttribute('tabindex', '0');
    btn.addEventListener('click', function () {
      const tabs = ['description', 'specs', 'reviews'];
      openTab(tabs[index]);
    });
  });
}

/**
 * Activate a detail tab panel.
 * @param {'description'|'specs'|'reviews'} tab
 */
function openTab(tab) {
  // Update tab buttons
  const tabNames = ['description', 'specs', 'reviews'];
  document.querySelectorAll('.detail-tab-btn').forEach(function (btn, i) {
    const isActive = tabNames[i] === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Update tab content panels
  document.querySelectorAll('.tab-content').forEach(function (panel) {
    panel.classList.remove('active');
  });
  const target = document.getElementById('tab-' + tab);
  if (target) {
    target.classList.add('active');
    // Smooth scroll so the tab section comes into view
    const tabsContainer = document.getElementById('detail-tabs');
    if (tabsContainer) {
      tabsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
window.openTab = openTab;



function initRelatedCards() {
  document.querySelectorAll('.btn-card-cart').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const card  = btn.closest('.product-card');
      const name  = card?.querySelector('.card-name')?.textContent?.trim()  || 'Product';
      const brand = card?.querySelector('.card-brand')?.textContent?.trim() || '';
      const priceText = card?.querySelector('.card-price .now')?.textContent?.trim() || 'R0';
      const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

      lue_addToCart({
        id:    'related-' + name.replace(/\s+/g, '-').toLowerCase().slice(0, 20),
        name, brand, price, quantity: 1,
      });
      syncCartBadge();

      // Visual feedback
      const orig = btn.textContent;
      btn.textContent      = '✓ Added!';
      btn.style.background = 'var(--green)';
      btn.style.color      = 'var(--white)';
      setTimeout(function () {
        btn.textContent      = orig;
        btn.style.background = '';
        btn.style.color      = '';
      }, 1800);

      showProductToast(name.slice(0, 28) + ' added to cart!');
    });

    // Card click → product detail (same page for prototype)
    const card = btn.closest('.product-card');
    if (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  });
}



function initStockUrgency() {
  const stockQtyEl = document.querySelector('.stock-qty');
  if (!stockQtyEl) return;

  if (PRODUCT.stockQty <= 5 && PRODUCT.stockQty > 0) {
    stockQtyEl.textContent = `— Only ${PRODUCT.stockQty} left — order soon!`;
    stockQtyEl.style.color      = '#C0392B';
    stockQtyEl.style.fontWeight = '600';
  } else if (PRODUCT.stockQty === 0) {
    stockQtyEl.textContent          = '— Out of stock';
    stockQtyEl.style.color          = '#C0392B';
    const addBtn = document.querySelector('.btn-add-cart');
    const buyBtn = document.querySelector('.btn-buy-now');
    if (addBtn) { addBtn.disabled = true; addBtn.style.opacity = '0.5'; addBtn.textContent = 'Out of Stock'; }
    if (buyBtn) { buyBtn.disabled = true; buyBtn.style.opacity = '0.5'; }
  }
}



function initSellButton() {
  document.querySelectorAll('.btn-sell').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const session = lue_getSession();
      if (!session) {
        lue_toast('Please sign in to start selling.', 'info');
        setTimeout(function () { window.location.href = 'signup.html#login'; }, 1200);
      } else if (session.role === 'seller') {
        window.location.href = 'create-listing.html';
      } else {
        lue_toast('Switch your account to Seller in your Profile to list products.', 'info');
      }
    });
  });
}



function showProductToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
}