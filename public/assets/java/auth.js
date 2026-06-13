

'use strict';

// ── Global constants ──────────────────────────────────────────────
var LUE = {
  MIN_PASSWORD_LENGTH: 8
};

// ── Password strength checker ─────────────────────────────────────
function lue_passwordStrength(password) {
  var score = 0;
  if (!password) return { score: 0, label: 'Too short' };
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  var labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  return { score: score, label: labels[Math.min(score, 5)] };
}
window.lue_passwordStrength = lue_passwordStrength;


function lue_apiUrl(endpoint) {
  var href = window.location.href;
  if (href.includes('/public/pages/')) {
    // e.g. http://localhost/linkupexpress/public/pages/signup.html
    // → http://localhost/linkupexpress/public/api/auth.php
    var root = href.substring(0, href.indexOf('/public/pages/')) + '/public';
    return root + '/api/' + endpoint + '.php';
  }
  if (href.includes('/public/')) {
    // Somewhere else inside public/
    var root = href.substring(0, href.indexOf('/public/')) + '/public';
    return root + '/api/' + endpoint + '.php';
  }
  if (href.includes('/pages/')) {
    // Old structure fallback
    var root = href.substring(0, href.indexOf('/pages/'));
    return root + '/api/' + endpoint + '.php';
  }
  // Root index.html - api is one level deeper in public/
  var root = href.substring(0, href.lastIndexOf('/'));
  return root + '/public/api/' + endpoint + '.php';
}
window.lue_apiUrl = lue_apiUrl;


var _lueSession = null;

/**
 * Fetch the current session from PHP and store in memory.
 * Call this once on every page load.
 */
async function lue_initSession() {
  try {
    // First try with PHP session cookie alone
    var url = lue_apiUrl('auth') + '?action=me';

    // If we have a cached user_id from a previous session, send it as fallback
    var cachedId = '';
    try { cachedId = localStorage.getItem('lue_uid') || ''; } catch(e) {}
    if (cachedId) url += '&user_id=' + encodeURIComponent(cachedId);

    var res  = await fetch(url, { credentials: 'same-origin' });
    var data = await res.json();
    if (data.ok && data.data) {
      _lueSession = data.data;
      // Cache the real DB user ID
      try { localStorage.setItem('lue_uid', data.data.id); } catch(e) {}
    } else {
      _lueSession = null;
      // Do NOT remove lue_uid here — keep it for retry attempts
      // It only gets removed on explicit logout
    }
  } catch (e) {
    _lueSession = null;
    console.warn('Could not reach auth API:', e.message);
  }
  return _lueSession;
}
window.lue_initSession = lue_initSession;

/** Return the in-memory session (null if not logged in). */
function lue_getSession() {
  return _lueSession;
}
window.lue_getSession = lue_getSession;

/** Set in-memory session (called after login/register). */
function lue_setSession(data) {
  _lueSession = data;
  // Cache user ID so PHP session fallback works across page loads
  if (data && data.id) {
    try { localStorage.setItem('lue_uid', data.id); } catch(e) {}
  }
}
window.lue_setSession = lue_setSession;

/** Clear in-memory session. */
function lue_clearSession() {
  _lueSession = null;
  try { localStorage.removeItem('lue_uid'); } catch(e) {}
}
window.lue_clearSession = lue_clearSession;

/** Returns true if a user is currently logged in. */
function lue_isLoggedIn() {
  return _lueSession !== null;
}
window.lue_isLoggedIn = lue_isLoggedIn;


async function lue_api(endpoint, action, method, body) {
  method = method || 'GET';
  var userId = _lueSession ? (_lueSession.id || '') : '';

  var url = lue_apiUrl(endpoint) + '?action=' + encodeURIComponent(action);
  if (userId) url += '&user_id=' + encodeURIComponent(userId);

  var payload = body ? Object.assign({}, body) : {};
  if (userId) payload.user_id = userId;

  var opts = {
    method:      method,
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (method !== 'GET') opts.body = JSON.stringify(payload);

  try {
    var res  = await fetch(url, opts);
    var data = await res.json();
    return data;
  } catch (err) {
    console.warn('API not reachable:', err.message);
    return { ok: false, error: 'Cannot connect. Is XAMPP running?' };
  }
}
window.lue_api = lue_api;


async function lue_logout() {
  try {
    await fetch(lue_apiUrl('auth') + '?action=logout', {
      method: 'POST', credentials: 'same-origin'
    });
  } catch (e) {}
  lue_clearSession();
  lue_clearCart();
  // Find project root by locating /public/ in URL
  var href2 = window.location.href;
  if (href2.includes('/public/')) {
    // e.g. http://localhost/linkupexpress/public/pages/profile.html
    // → http://localhost/linkupexpress/index.html
    var rootUrl = href2.substring(0, href2.indexOf('/public/')) + '/index.html';
    window.location.href = rootUrl;
  } else {
    // Already at root e.g. http://localhost/linkupexpress/index.html
    var parts = href2.split('/');
    parts.pop(); // remove filename
    window.location.href = parts.join('/') + '/index.html';
  }
}
window.lue_logout = lue_logout;


var CART_KEY = 'lue_cart';

function lue_getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; }
}
function lue_saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}
function lue_addToCart(item) {
  var cart = lue_getCart();
  var existing = cart.find(function (i) { return i.id === item.id; });
  if (existing) { existing.quantity = (existing.quantity || 1) + 1; }
  else { cart.push(Object.assign({ quantity: 1 }, item)); }
  lue_saveCart(cart);
  return cart;
}
function lue_removeFromCart(itemId) {
  lue_saveCart(lue_getCart().filter(function (i) { return i.id !== itemId; }));
}
function lue_clearCart() {
  localStorage.removeItem(CART_KEY);
}
window.lue_getCart      = lue_getCart;
window.lue_saveCart     = lue_saveCart;
window.lue_addToCart    = lue_addToCart;
window.lue_removeFromCart = lue_removeFromCart;
window.lue_clearCart    = lue_clearCart;


function lue_syncHeader() {
  var cart  = lue_getCart();
  var total = cart.reduce(function (s, i) { return s + (i.quantity || 1); }, 0);
  var badge = document.getElementById('cart-count');
  if (badge) {
    badge.textContent   = total > 0 ? String(total) : '';
    badge.style.display = total > 0 ? 'flex' : 'none';
  }

  // Update the Sign In button / user dropdown based on login state
  if (typeof updateHeaderAuthUI === 'function') {
    updateHeaderAuthUI();
  }
  if (typeof initHeaderSignIn === 'function') {
    initHeaderSignIn();
  }
}
window.lue_syncHeader = lue_syncHeader;


function lue_toast(message, type, duration) {
  type     = type     || 'success';
  duration = duration || 3000;
  var toast = document.getElementById('lue-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'lue-toast';
    toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);padding:12px 22px;border-radius:32px;font-family:Barlow,sans-serif;font-size:13px;font-weight:600;z-index:9999;transition:transform .35s,opacity .35s;opacity:0;white-space:nowrap;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.2);';
    document.body.appendChild(toast);
  }
  var bg = type === 'error' ? '#C0392B' : type === 'info' ? '#1B3A8C' : '#0A2463';
  var fg = type === 'success' ? '#F5C518' : '#fff';
  toast.style.background = bg;
  toast.style.color      = fg;
  toast.innerHTML        = message;
  toast.style.transform  = 'translateX(-50%) translateY(0)';
  toast.style.opacity    = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    toast.style.opacity   = '0';
  }, duration);
}
window.lue_toast = lue_toast;


function lue_fieldError(field, message) {
  if (!field) return;
  field.style.borderColor = '#C0392B';
  field.style.boxShadow   = '0 0 0 3px rgba(192,57,43,0.12)';
  var existing = field.parentNode.querySelector('.lue-field-error');
  if (existing) existing.remove();
  var err = document.createElement('div');
  err.className   = 'lue-field-error';
  err.textContent = message;
  err.style.cssText = 'font-size:11px;color:#C0392B;margin-top:4px;font-weight:600;';
  field.parentNode.appendChild(err);
}
function lue_clearFieldError(field) {
  if (!field) return;
  field.style.borderColor = '';
  field.style.boxShadow   = '';
  var existing = field.parentNode.querySelector('.lue-field-error');
  if (existing) existing.remove();
}
window.lue_fieldError      = lue_fieldError;
window.lue_clearFieldError = lue_clearFieldError;


function lue_formatZAR(amount) {
  return 'R\u00A0' + Number(amount).toLocaleString('en-ZA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}
function lue_navigate(path) { window.location.href = path; }
window.lue_formatZAR = lue_formatZAR;
window.lue_navigate  = lue_navigate;


function lue_clearAllErrors(form) {
  if (!form) return;
  form.querySelectorAll('.lue-field-error').forEach(function(e) { e.remove(); });
  form.querySelectorAll('input, select, textarea').forEach(function(f) {
    f.style.borderColor = '';
    f.style.boxShadow   = '';
  });
}

function lue_isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function lue_isValidPhone(phone) {
  // Accept SA phone numbers: 0XX XXX XXXX or +27XX XXX XXXX
  var cleaned = (phone || '').replace(/[\s\-()]/g, '');
  return /^(\+27|0)[6-8][0-9]{8}$/.test(cleaned);
}

window.lue_clearAllErrors = lue_clearAllErrors;
window.lue_isValidEmail   = lue_isValidEmail;
window.lue_isValidPhone   = lue_isValidPhone;