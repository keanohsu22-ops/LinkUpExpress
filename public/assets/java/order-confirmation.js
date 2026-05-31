/**
 * order-confirmation.js — LinkUp Express
 * ─────────────────────────────────────────────────────────────────
 * Handles all interactive behaviour on order-confirmation.html:
 *
 *   1.  Header auth sync
 *   2.  Generate and display a unique order reference number
 *   3.  Set live issue date and time on the receipt
 *   4.  Populate order items from sessionStorage checkout data
 *   5.  Populate the cost breakdown (subtotal, VAT, discount, total)
 *   6.  Populate Yoko payment details with a generated transaction ID
 *   7.  Copy order reference to clipboard
 *   8.  Print receipt (window.print)
 *   9.  Download PDF receipt (html2canvas + jsPDF fallback)
 *   10. Email receipt simulation
 *   11. Order tracking progress bar — set to correct step
 *   12. Clear cart after successful checkout
 *   13. Redirect to login if not logged in
 *
 * Dependencies: auth.js must be loaded before this file.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {
  lue_syncHeader();
  guardLoginRequired();
  buildReceiptData();
  initCopyRef();
  initReceiptActions();
});

/* ═══════════════════════════════════════════════════════════════════
   1. LOGIN GUARD
   If someone navigates to this page without a session, redirect them.
═══════════════════════════════════════════════════════════════════ */

function guardLoginRequired() {
  if (!lue_isLoggedIn()) {
    // Allow viewing the demo receipt without login for prototype purposes.
    // In production, uncomment the redirect below:
    // window.location.href = 'signup.html';
    return;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   2. BUILD RECEIPT DATA
   Reads sessionStorage for real checkout data.
   Falls back to demo data if the page is visited directly.
═══════════════════════════════════════════════════════════════════ */

function buildReceiptData() {
  const session  = lue_getSession();
  const checkout = readCheckout();

  // ── 1. Order reference ─────────────────────────────────────────
  const orderRef = generateOrderRef();
  setElement('order-num', orderRef);

  // Also update any other elements that display the reference
  document.querySelectorAll('[data-lue="order-ref"]').forEach(function (el) {
    el.textContent = orderRef;
  });
  // Update the support help-box reference
  const helpText = document.querySelector('.help-box p');
  if (helpText) {
    helpText.innerHTML = helpText.innerHTML.replace('LUE-2026-847291', orderRef);
  }
  // Receipt download button subtitle
  const dlSub = document.querySelector('.action-btn:nth-child(2) .btn-sub');
  if (dlSub) dlSub.textContent = 'Receipt · ' + orderRef;

  // ── 2. Issue date/time ─────────────────────────────────────────
  setReceiptDate();

  // ── 3. Cardholder name from session ────────────────────────────
  if (session) {
    const nameParts   = session.fullName.split(' ');
    const cardholderText = (nameParts[0].charAt(0) + '. ' + (nameParts[nameParts.length - 1] || '')).toUpperCase();

    // Update cardholder in Yoko block
    document.querySelectorAll('.y-val').forEach(function (el) {
      if (el.textContent.trim() === 'S. DLAMINI') {
        el.textContent = cardholderText;
      }
    });

    // Update email in receipt action button
    const emailSub = document.querySelector('.action-btn:nth-child(3) .btn-sub');
    if (emailSub) emailSub.textContent = 'Sent to ' + session.email;
  }

  // ── 4. Yoko transaction ID ─────────────────────────────────────
  const txnId   = generateYokoTxnId();
  const authCode = 'AUTH-' + Math.floor(100000 + Math.random() * 900000);
  document.querySelectorAll('.y-val').forEach(function (el) {
    if (el.textContent.trim() === 'YKO-7X49-KM82-3P01') el.textContent = txnId;
    if (el.textContent.trim() === 'AUTH-309412')          el.textContent = authCode;
  });
  // Meta strip transaction ID
  document.querySelectorAll('.meta-val').forEach(function (el) {
    if (el.textContent.trim() === 'YKO-7X49-KM82-3P01') el.textContent = txnId;
  });

  // ── 5. Order items and totals from checkout data ───────────────
  if (checkout && checkout.items && checkout.items.length > 0) {
    renderOrderItems(checkout.items);
    renderCostBreakdown(checkout.items, checkout.promoCode);
    renderPaymentAmount(checkout.items, checkout.promoCode);
  }

  // ── 6. Delivery address from session ──────────────────────────
  if (session) {
    const addrBlock = document.querySelector('.delivery-box p');
    if (addrBlock && session.address) {
      addrBlock.innerHTML = `${escHtml(session.fullName)}<br/>${escHtml(session.address)}`;
    }
  }

  // ── 7. Clear cart now that order is confirmed ──────────────────
  lue_clearCart();
  // Update any cart badge — should be 0 now
  document.querySelectorAll('.badge').forEach(function (b) {
    b.textContent   = '0';
    b.style.display = 'none';
  });

  // ── 8. Set tracking bar to "Payment Confirmed" step ───────────
  updateTrackingBar('preparing');
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS — data generation
═══════════════════════════════════════════════════════════════════ */

/**
 * Read and parse checkout data from sessionStorage.
 * @returns {Object|null}
 */
function readCheckout() {
  try {
    const raw = sessionStorage.getItem('lue_checkout');
    if (!raw) return null;
    const data = JSON.parse(raw);
    sessionStorage.removeItem('lue_checkout'); // consume once
    return data;
  } catch {
    return null;
  }
}

/**
 * Generate a unique LinkUp Express order reference.
 * @returns {string} e.g. "LUE-2026-847291"
 */
function generateOrderRef() {
  const year = new Date().getFullYear();
  const num  = Math.floor(100000 + Math.random() * 900000);
  return `LUE-${year}-${num}`;
}

/**
 * Generate a plausible Yoko transaction ID.
 * @returns {string} e.g. "YKO-7X49-KM82-3P01"
 */
function generateYokoTxnId() {
  function seg(n) {
    return Math.random().toString(36).slice(2, 2 + n).toUpperCase().padEnd(n, '0');
  }
  return `YKO-${seg(4)}-${seg(4)}-${seg(4)}`;
}

/**
 * Set the receipt issue date element to the current date/time.
 */
function setReceiptDate() {
  const now    = new Date();
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const hh     = String(now.getHours()).padStart(2, '0');
  const mm     = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const timeStr = `${hh}:${mm} SAST`;
  setElement('receipt-date', `Issued ${dateStr} · ${timeStr}`);

  // Update paid_at in Yoko block
  document.querySelectorAll('.y-val').forEach(function (el) {
    if (/^\d{2} [A-Z][a-z]+ \d{4}/.test(el.textContent.trim())) {
      el.textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} · ${hh}:${mm}:${String(now.getSeconds()).padStart(2,'0')} SAST`;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER ORDER ITEMS FROM CHECKOUT DATA
═══════════════════════════════════════════════════════════════════ */

function renderOrderItems(items) {
  const container = document.querySelector('.order-items');
  if (!container) return;
  container.innerHTML = '';

  const emojis = { Sony: '🎧', LG: '🖥️', Samsung: '📱', PlayStation: '🎮', Canon: '📷', Bose: '🎤', JBL: '🔊', Logitech: '🖱️', Anker: '🔌' };

  items.forEach(function (item) {
    const emoji    = emojis[item.brand] || '📦';
    const lineTotal = item.price * (item.quantity || 1);
    const row = document.createElement('div');
    row.className = 'order-item';
    row.innerHTML = `
      <div class="oi-img">${emoji}</div>
      <div class="oi-info">
        <div class="oi-brand">${escHtml(item.brand || '')}</div>
        <div class="oi-name">${escHtml(item.name)}</div>
        <div class="oi-meta">
          ${item.colour ? `<span>Colour: ${escHtml(item.colour)}</span><span>·</span>` : ''}
          ${item.sku ? `<span>SKU: ${escHtml(item.sku)}</span><span>·</span>` : ''}
          <span>Seller: ${escHtml(item.seller || 'LinkUp Express')}</span>
        </div>
      </div>
      <div class="oi-qty">Qty: ${item.quantity || 1}</div>
      <div class="oi-price">
        <span class="unit">${lue_formatZAR(item.price)} each</span>
        <span class="total">${lue_formatZAR(lineTotal)}</span>
      </div>`;
    container.appendChild(row);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER COST BREAKDOWN
═══════════════════════════════════════════════════════════════════ */

function renderCostBreakdown(items, promo) {
  const subtotal = items.reduce(function (s, i) { return s + i.price * (i.quantity || 1); }, 0);
  let discount   = 0;
  if (promo) {
    discount = promo.type === 'percent'
      ? subtotal * (promo.value / 100)
      : Math.min(promo.value, subtotal);
  }
  const total  = subtotal - discount;
  const vat    = total * (0.15 / 1.15); // VAT inclusive

  const rows = document.querySelectorAll('.cost-breakdown .cost-row');
  if (rows.length >= 4) {
    const cells = Array.from(rows).map(function (r) { return r.querySelectorAll('.lbl, .val'); });
    // Subtotal
    if (cells[0]) cells[0][1].textContent = lue_formatZAR(subtotal);
    // Discount (index 2)
    if (cells[2]) {
      cells[2][1].textContent = discount > 0 ? '−' + lue_formatZAR(discount) : 'R\u00A00.00';
      cells[2][1].style.color = discount > 0 ? 'var(--green)' : '';
    }
    // VAT
    if (cells[3]) cells[3][1].textContent = lue_formatZAR(vat);
    // Total
    if (cells[4]) cells[4][1].textContent = lue_formatZAR(total);
  }

  // Also update the receipt header amount
  const headerAmount = document.querySelector('.rh-val');
  if (headerAmount) headerAmount.textContent = lue_formatZAR(total);
}

function renderPaymentAmount(items, promo) {
  const subtotal = items.reduce(function (s, i) { return s + i.price * (i.quantity || 1); }, 0);
  let discount   = 0;
  if (promo) {
    discount = promo.type === 'percent'
      ? subtotal * (promo.value / 100)
      : Math.min(promo.value, subtotal);
  }
  const total = subtotal - discount;
  // Update the Yoko payment amount field
  document.querySelectorAll('.y-val').forEach(function (el) {
    if (/^R[\u00A0\s][\d,]+\.\d{2}$/.test(el.textContent.trim())) {
      el.textContent = lue_formatZAR(total);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ORDER TRACKING BAR
═══════════════════════════════════════════════════════════════════ */

/**
 * Set the visual state of the order tracking progress bar.
 * @param {'placed'|'confirmed'|'preparing'|'dispatched'|'delivered'} stage
 */
function updateTrackingBar(stage) {
  const stageOrder = ['placed', 'confirmed', 'preparing', 'dispatched', 'delivered'];
  const stageIdx   = stageOrder.indexOf(stage);
  if (stageIdx === -1) return;

  const dots  = document.querySelectorAll('.track-dot');
  const lines = document.querySelectorAll('.track-line');
  const labels = document.querySelectorAll('.track-label');

  dots.forEach(function (dot, i) {
    dot.className = 'track-dot';
    if (i < stageIdx)      { dot.classList.add('done');   dot.textContent = '✓'; }
    else if (i === stageIdx){ dot.classList.add('active'); dot.textContent = '●'; }
    else                    { dot.classList.add('pending');dot.textContent = String(i + 1); }
  });

  lines.forEach(function (line, i) {
    line.className = 'track-line ' + (i < stageIdx ? 'done' : 'pending');
  });

  labels.forEach(function (lbl, i) {
    lbl.className = 'track-label';
    if (i < stageIdx)       lbl.classList.add('done');
    else if (i === stageIdx) lbl.classList.add('active');
  });
}

/* ═══════════════════════════════════════════════════════════════════
   3. COPY ORDER REF
═══════════════════════════════════════════════════════════════════ */

function initCopyRef() {
  const copyBtn = document.querySelector('.order-ref button');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () { copyOrderRef(); });
  }
}

function copyOrderRef() {
  const ref = document.getElementById('order-num')?.textContent?.trim() || '';
  if (!ref) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ref).then(function () {
      showConfirmToast('Order number copied to clipboard!');
    }).catch(function () {
      fallbackCopy(ref);
    });
  } else {
    fallbackCopy(ref);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showConfirmToast('Order number copied!');
}

// Expose for inline onclick="copyRef()"
window.copyRef = copyOrderRef;

/* ═══════════════════════════════════════════════════════════════════
   4–6. RECEIPT ACTIONS (Print, Download, Email)
═══════════════════════════════════════════════════════════════════ */

function initReceiptActions() {
  // Print button is handled inline (window.print()) — no JS needed beyond that.

  // Download PDF
  const dlBtn = document.querySelector('.action-btn:nth-child(2)');
  if (dlBtn) {
    dlBtn.addEventListener('click', function () { downloadReceiptPDF(); });
  }

  // Email receipt
  const emailBtn = document.querySelector('.action-btn:nth-child(3)');
  if (emailBtn) {
    emailBtn.addEventListener('click', function () { emailReceipt(); });
  }
}

function downloadReceiptPDF() {
  // For the prototype, trigger the browser's print-to-PDF dialog.
  // In production, this would call a server-side PDF generation API.
  showConfirmToast('Opening print dialog — choose "Save as PDF" as your printer.');
  setTimeout(function () { window.print(); }, 800);
}

function emailReceipt() {
  const session = lue_getSession();
  const email   = session ? session.email : 'your registered email address';
  showConfirmToast(`Receipt sent to ${email}!`);
}

// Expose for inline onclick attributes in the HTML
window.downloadPDF   = downloadReceiptPDF;
window.emailReceipt  = emailReceipt;

/* ═══════════════════════════════════════════════════════════════════
   TOAST — uses the existing #toast element (or lue_toast fallback)
═══════════════════════════════════════════════════════════════════ */

function showConfirmToast(msg) {
  // The order-confirmation page builds its toast dynamically in the original JS.
  // We re-use or create the element here.
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:28px', 'left:50%',
      'transform:translateX(-50%) translateY(80px)',
      'background:var(--blue, #0A2463)', 'color:var(--white, #fff)',
      'padding:12px 22px', 'border-radius:32px',
      'font-size:13px', 'font-weight:600',
      'box-shadow:0 6px 24px rgba(10,36,99,.30)',
      'z-index:500',
      'transition:transform .35s cubic-bezier(.34,1.56,.64,1),opacity .35s',
      'opacity:0', 'display:flex', 'align-items:center', 'gap:8px',
      'white-space:nowrap', 'font-family:var(--font,"Barlow",sans-serif)',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent   = '✓ ' + msg;
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.opacity   = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    toast.style.opacity   = '0';
  }, 3200);
}

// Expose for any remaining inline onclick="showToast(...)" in the HTML
window.showToast = showConfirmToast;

/* ═══════════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════════ */

function setElement(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}
