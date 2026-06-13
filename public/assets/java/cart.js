

'use strict';







/** Cart items — each: { id, name, brand, price, quantity, colour?, seller? } */
let cartItems     = [];
/** Applied promo code object or null */
let appliedPromo  = null;
/** Track which HTML item-ids map to which cart item ids */
let itemHtmlMap   = {};

const VAT_RATE = 0.15;  // 15% VAT included in price



document.addEventListener('DOMContentLoaded', async function () {
  // Init session first so lue_isLoggedIn() works correctly
  if (window.lue_initSession) await lue_initSession();
  if (window.lue_syncHeader)  lue_syncHeader();
  loadCartFromStorage();
  renderCartItems();
  initPromoCode();
  initSelectAll();
  initUpsellCards();
  initCheckoutButton();
  initContinueShopping();
});



function loadCartFromStorage() {
  cartItems = lue_getCart();

  // Remove any old demo items that may still be sitting in localStorage
  // from before the dummy data was cleared. Demo items have IDs starting with 'demo-'
  var hadDemo = cartItems.some(function(i) {
    return i.id && (i.id.startsWith('demo-') || i.id.startsWith('related-') || i.id.startsWith('upsell-'));
  });
  if (hadDemo) {
    cartItems = cartItems.filter(function(i) {
      return !(i.id && (i.id.startsWith('demo-') || i.id.startsWith('related-') || i.id.startsWith('upsell-')));
    });
    lue_saveCart(cartItems);
  }
}



function renderCartItems() {
  const container = document.getElementById('cart-items');
  if (!container) return;
  container.innerHTML = '';
  itemHtmlMap = {};

  cartItems.forEach(function (item, index) {
    const htmlId   = 'cart-row-' + index;
    itemHtmlMap[htmlId] = item.id;

    const discount  = item.price < (item.rrp || 0) ? Math.round((1 - item.price / item.rrp) * 100) : 0;
    const wasHtml   = item.rrp && item.rrp > item.price
      ? `<span class="price-was">${lue_formatZAR(item.rrp)}</span>
         <span class="price-discount">-${discount}%</span>`
      : '';
    const metaTags  = [];
    if (item.colour) metaTags.push(`<span class="item-tag">Colour: ${item.colour}</span>`);
    metaTags.push(`<span class="item-tag green">✓ In Stock</span>`);
    metaTags.push(`<span class="item-tag">🚚 Free delivery</span>`);

    const row = document.createElement('div');
    row.className   = 'cart-item';
    row.id          = htmlId;
    row.dataset.itemId = item.id;
    row.innerHTML = `
      <div class="item-check">
        <input type="checkbox" class="item-checkbox" data-html-id="${htmlId}" checked
               onchange="onCheckboxChange()" />
      </div>
      <div class="item-img">${getProductEmoji(item.brand)}</div>
      <div class="item-details">
        <div class="item-brand">${escHtml(item.brand)}</div>
        <a href="product-detail.html" class="item-name">${escHtml(item.name)}</a>
        <div class="item-meta">${metaTags.join('')}</div>
        ${item.seller ? `<div style="font-size:11px;color:var(--gray-400);margin-bottom:8px;">Sold by: ${escHtml(item.seller)}</div>` : ''}
        <div class="item-actions">
          <button class="btn-wishlist-move" onclick="moveItemToWishlist('${item.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            Save for later
          </button>
          <button class="btn-remove" onclick="removeCartItem('${item.id}', '${htmlId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
            Remove
          </button>
        </div>
      </div>
      <div class="item-right">
        <div class="item-price">
          <span class="now" style="font-family:var(--font-cond);font-size:22px;font-weight:700;display:block;">
            ${lue_formatZAR(item.price)}
          </span>
          ${wasHtml}
        </div>
        <div class="qty-ctrl">
          <button class="qty-btn-sm" onclick="changeItemQty('${item.id}', -1)">−</button>
          <div class="qty-val" id="qty-${item.id}">${item.quantity}</div>
          <button class="qty-btn-sm" style="border-left:none;border-radius:0 var(--radius) var(--radius) 0;"
                  onclick="changeItemQty('${item.id}', 1)">+</button>
        </div>
      </div>`;
    container.appendChild(row);
  });

  recalculate();
  checkEmptyState();
  updateHeaderBadge();
}

/** Pick an emoji based on brand name */
function getProductEmoji(brand) {
  const map = { Sony: '🎧', LG: '🖥️', Samsung: '📱', PlayStation: '🎮', Canon: '📷', Bose: '🎤', JBL: '🔊', Logitech: '🖱️', Anker: '🔌' };
  return map[brand] || '📦';
}

/** Escape HTML to prevent XSS */
function escHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}



function changeItemQty(itemId, delta) {
  const item = cartItems.find(function (i) { return i.id === itemId; });
  if (!item) return;

  item.quantity = Math.max(1, Math.min(99, (item.quantity || 1) + delta));

  const qtyDisplay = document.getElementById('qty-' + itemId);
  if (qtyDisplay) qtyDisplay.textContent = item.quantity;

  lue_saveCart(cartItems);
  recalculate();
  updateHeaderBadge();
}
window.changeItemQty = changeItemQty;

// Legacy support for inline onclick="changeQty(id, delta)"
window.changeQty = changeItemQty;

function removeCartItem(itemId, htmlId) {
  const rowEl = document.getElementById(htmlId) || document.querySelector('[data-item-id="' + itemId + '"]');
  if (rowEl) {
    rowEl.style.transition = 'opacity .3s, transform .3s';
    rowEl.style.opacity    = '0';
    rowEl.style.transform  = 'translateX(-20px)';
    setTimeout(function () {
      rowEl.remove();
      cartItems = cartItems.filter(function (i) { return i.id !== itemId; });
      lue_saveCart(cartItems);
      recalculate();
      checkEmptyState();
      updateHeaderBadge();
      showCartToast('Item removed from cart.');
    }, 300);
  }
}
window.removeCartItem = removeCartItem;

// Legacy support for inline onclick="removeItem(1)"
window.removeItem = function (htmlIndex) {
  const row    = document.getElementById('item-' + htmlIndex);
  const itemId = row?.dataset?.itemId;
  if (itemId) removeCartItem(itemId, 'item-' + htmlIndex);
  else if (row) {
    row.style.opacity   = '0';
    row.style.transform = 'translateX(-20px)';
    row.style.transition = 'opacity .3s, transform .3s';
    setTimeout(function () { row.remove(); recalculate(); checkEmptyState(); }, 300);
  }
};



function moveItemToWishlist(itemId) {
  const item = cartItems.find(function (i) { return i.id === itemId; });
  if (item) lue_toggleWishlist({ id: item.id, name: item.name, price: item.price, brand: item.brand });

  const htmlId = Object.keys(itemHtmlMap).find(function (k) { return itemHtmlMap[k] === itemId; });
  removeCartItem(itemId, htmlId || '');
  showCartToast('Item saved to your wishlist!');
}
window.moveItemToWishlist = moveItemToWishlist;

// Legacy support for inline onclick="moveToWishlist(1)"
window.moveToWishlist = function (htmlIndex) {
  const row    = document.getElementById('item-' + htmlIndex);
  const itemId = row?.dataset?.itemId;
  if (itemId) moveItemToWishlist(itemId);
};



function initSelectAll() {
  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      toggleSelectAll();
    });
  }
}

function toggleSelectAll() {
  const selectAll = document.getElementById('select-all');
  const checked   = selectAll ? selectAll.checked : true;
  document.querySelectorAll('.item-checkbox').forEach(function (cb) { cb.checked = checked; });
  recalculate();
}
window.toggleSelectAll = toggleSelectAll;

function onCheckboxChange() {
  recalculate();
  // Keep select-all in sync
  const all     = document.querySelectorAll('.item-checkbox');
  const checked = document.querySelectorAll('.item-checkbox:checked');
  const sa      = document.getElementById('select-all');
  if (sa) sa.checked = all.length === checked.length;
}
window.onCheckboxChange = onCheckboxChange;

function removeSelected() {
  const checked = document.querySelectorAll('.item-checkbox:checked');
  if (checked.length === 0) {
    showCartToast('No items selected.', 'info');
    return;
  }
  checked.forEach(function (cb) {
    const row    = cb.closest('.cart-item');
    const itemId = row?.dataset?.itemId;
    const htmlId = row?.id;
    if (itemId) removeCartItem(itemId, htmlId || '');
  });
}
window.removeSelected = removeSelected;



function recalculate() {
  // Only count checked items
  const checkedIds = new Set();
  document.querySelectorAll('.item-checkbox:checked').forEach(function (cb) {
    const row = cb.closest('.cart-item');
    if (row) checkedIds.add(row.dataset.itemId);
  });

  let subtotal   = 0;
  let totalQty   = 0;
  let itemCount  = 0;

  cartItems.forEach(function (item) {
    if (checkedIds.has(item.id) || checkedIds.size === 0) {
      const qty = item.quantity || 1;
      subtotal  += item.price * qty;
      totalQty  += qty;
      itemCount++;
    }
  });

  
  let discount = 0;
  if (appliedPromo) {
    if (appliedPromo.type === 'percent') {
      discount = subtotal * (appliedPromo.value / 100);
    } else {
      discount = Math.min(appliedPromo.value, subtotal);
    }
  }

  const afterDiscount = subtotal - discount;
  const vatAmount     = afterDiscount * (VAT_RATE / (1 + VAT_RATE)); // VAT included in price
  const total         = afterDiscount;

  // Update DOM
  setText('sum-items-lbl', `Items (${itemCount})`);
  setText('sum-subtotal',  lue_formatZAR(subtotal));
  setText('sum-vat',       lue_formatZAR(vatAmount));
  setText('sum-total',     lue_formatZAR(total));
  setText('item-count-label', `${totalQty} item${totalQty !== 1 ? 's' : ''}`);

  const discEl  = document.getElementById('sum-discount');
  const discLine = document.getElementById('discount-line');
  if (discEl)  discEl.textContent      = '−' + lue_formatZAR(discount);
  if (discLine) discLine.style.display = appliedPromo ? 'flex' : 'none';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}



function initUpsellCards() {
  document.querySelectorAll('.btn-upsell-add').forEach(function (btn) {
    btn.addEventListener('click', function () {
      handleUpsellAdd(btn);
    });
  });
}

function handleUpsellAdd(btn) {
  const card  = btn.closest('.upsell-card');
  const name  = card?.querySelector('.upsell-name')?.textContent?.trim() || 'Product';
  const brand = card?.querySelector('.upsell-brand')?.textContent?.trim() || '';
  const priceText = card?.querySelector('.upsell-price')?.textContent?.trim() || 'R0';
  const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

  lue_addToCart({
    id:    'upsell-' + name.replace(/\s+/g, '-').toLowerCase().slice(0, 20),
    name, brand, price, quantity: 1,
  });

  // Refresh the rendered list
  cartItems = lue_getCart();
  renderCartItems();
  updateHeaderBadge();
  showCartToast(name.slice(0, 28) + ' added to cart!');

  btn.textContent      = '✓ Added!';
  btn.style.background = 'var(--green)';
  btn.style.color      = 'var(--white)';
  btn.disabled         = true;
}

// Legacy support for inline onclick="upsellAdd(this, name, price)"
window.upsellAdd = function (btn, name, price) { handleUpsellAdd(btn); };



function initCheckoutButton() {
  const btn = document.querySelector('.btn-checkout');
  if (!btn) return;

  btn.addEventListener('click', function (e) {
    e.preventDefault();

    if (cartItems.length === 0) {
      showCartToast('Your cart is empty.', 'info');
      return;
    }

    // Check login — accept lue_uid as fallback if session not yet loaded
    var uid = '';
    try { uid = localStorage.getItem('lue_uid') || ''; } catch(e) {}
    if (!lue_isLoggedIn() && !uid) {
      showCartToast('Please sign in to continue to payment.', 'info');
      setTimeout(function () { window.location.href = 'signup.html'; }, 1400);
      return;
    }

    // Save checkout summary to sessionStorage so payment page can read it
    const checkedIds = new Set();
    document.querySelectorAll('.item-checkbox:checked').forEach(function (cb) {
      const row = cb.closest('.cart-item');
      if (row) checkedIds.add(row.dataset.itemId);
    });

    const checkoutItems = cartItems.filter(function (i) {
      return checkedIds.size === 0 || checkedIds.has(i.id);
    });

    sessionStorage.setItem('lue_checkout', JSON.stringify({
      items:       checkoutItems,
      promoCode:   appliedPromo,
      timestamp:   new Date().toISOString(),
    }));

    window.location.href = 'payment.html';
  });
}



function checkEmptyState() {
  const emptyEl   = document.getElementById('empty-cart');
  const toolbarEl = document.getElementById('cart-toolbar');
  const itemsEl   = document.getElementById('cart-items');
  const isEmpty   = cartItems.length === 0;

  if (emptyEl)   emptyEl.style.display   = isEmpty ? 'block' : 'none';
  if (toolbarEl) toolbarEl.style.display = isEmpty ? 'none'  : 'flex';
  if (itemsEl)   itemsEl.style.display   = isEmpty ? 'none'  : 'block';
}



function updateHeaderBadge() {
  const count = cartItems.reduce(function (s, i) { return s + (i.quantity || 1); }, 0);
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent   = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}



function initContinueShopping() {
  document.querySelectorAll('.btn-continue, a[href="../../index.html"]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (el.tagName === 'A') return; // let the link navigate naturally
      e.preventDefault();
      window.location.href = '../../index.html';
    });
  });
}



function showCartToast(msg, type) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (!toast) { lue_toast(msg, type || 'success'); return; }
  if (msgEl) msgEl.textContent = msg;
  if (type === 'error') {
    toast.style.background = 'var(--red, #C0392B)';
  } else if (type === 'info') {
    toast.style.background = 'var(--blue-mid, #1B3A8C)';
  } else {
    toast.style.background = '';
  }
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
}
