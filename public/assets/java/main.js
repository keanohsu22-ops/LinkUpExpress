/**
 * main.js — LinkUp Express Homepage
 * ─────────────────────────────────────────────────────────────────
 * Handles all interactive behaviour on index.html:
 *
 *   1. Header auth state sync (Sign In / user name / logout)
 *   2. Search bar functionality
 *   3. Category card navigation
 *   4. Product card Add to Cart and Wishlist buttons
 *   5. Brand pill active toggle
 *   6. Sell button — redirects to create-listing or signup
 *   7. Mini login modal triggered from header Sign In button
 *   8. Scroll-to-top button
 *   9. Toast notifications
 *
 * Dependencies: auth.js must be loaded before this file.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// Detect correct path prefix for page links
// When on root index.html, pages are in public/pages/
// When already inside public/pages/, no prefix needed
var _pagePrefix = (function() {
  var href = window.location.href;
  if (href.includes('/public/pages/')) return '';       // already inside pages
  if (href.includes('/public/'))       return 'pages/'; // inside public but not pages
  return 'public/pages/';                               // at root level
})();

function _page(name) { return _pagePrefix + name; }

/* ═══════════════════════════════════════════════════════════════════
   BOOT — runs after the DOM is fully loaded
═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async function () {
  await lue_initSession();
  lue_syncHeader();          // Update header to reflect login state
  initSearch();              // Wire up the search bar
  initProductCards();        // Add to Cart + Wishlist on product cards
  initBrandPills();          // Brand pill filter toggle
  initSellButton();          // Sell / + Sell button logic
  initHeaderSignIn();        // Mini login modal on header Sign In click
  initScrollToTop();         // Floating scroll-to-top button
  initCategoryCards();       // Category tile click navigation
  updateHeaderAuthUI();      // Swap Sign In → username if logged in
});

/* ═══════════════════════════════════════════════════════════════════
   1. HEADER AUTH UI
   Replaces the "Sign In" header action with the user's first name
   and a dropdown containing Profile, My Orders, and Log Out links
   when a session is active.
═══════════════════════════════════════════════════════════════════ */

function updateHeaderAuthUI() {
  const session = lue_getSession();
  const signInAction = document.getElementById('header-signin');
  if (!signInAction) return;

  if (session) {
    const firstName = session.fullName.split(' ')[0];

    // Replace the action button with a logged-in dropdown
    signInAction.innerHTML = `
      <div class="user-dropdown" id="user-dropdown">
        <button class="user-dropdown-trigger" onclick="event.stopPropagation(); toggleUserDropdown();" aria-expanded="false">
          <div class="user-avatar">${firstName.charAt(0).toUpperCase()}</div>
          <span>${firstName}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;opacity:.7;">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="user-dropdown-menu" id="user-dropdown-menu" style="display:none;">
          <div class="dropdown-user-info">
            <div class="dropdown-name">${session.fullName}</div>
            <div class="dropdown-email">${session.email}</div>
            <span class="dropdown-role-badge">${session.role === 'seller' ? '🏪 Seller' : '🛍️ Buyer'}</span>
          </div>
          <div class="dropdown-divider"></div>
          <a href="javascript:void(0)" onclick="location.href=_page('profile.html')" class="dropdown-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            My Profile
          </a>
          <a href="javascript:void(0)" onclick="location.href=_page('cart.html')" class="dropdown-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            My Cart
          </a>
          ${session.role === 'seller' ? `
          <div class="dropdown-divider"></div>
          <a href="javascript:void(0)" onclick="location.href=_page('listings.html')" class="dropdown-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            My Listings
          </a>
          <a href="javascript:void(0)" onclick="location.href=_page('create-listing.html')" class="dropdown-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Listing
          </a>` : ''}
          <div class="dropdown-divider"></div>
          <button class="dropdown-item dropdown-signout" onclick="lue_logout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log Out
          </button>
        </div>
      </div>`;

    // Remove the navigate-to-signup onclick from the container div
    signInAction.onclick = null;
    signInAction.style.cursor = 'default';

    // Inject dropdown styles if not already present
    injectDropdownStyles();

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
      const dd = document.getElementById('user-dropdown');
      if (dd && !dd.contains(e.target)) closeUserDropdown();
    });

  } else {
    // Not logged in — clicking the div navigates to signup
    signInAction.onclick = function() {
      window.location.href = _page('signup.html');
    };
  }
}

/** Toggle the user dropdown open/closed */
function toggleUserDropdown() {
  const menu    = document.getElementById('user-dropdown-menu');
  const trigger = document.querySelector('.user-dropdown-trigger');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  if (trigger) trigger.setAttribute('aria-expanded', String(!isOpen));
}

function closeUserDropdown() {
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.style.display = 'none';
}

window.toggleUserDropdown = toggleUserDropdown;

/** Inject dropdown CSS once into <head> */
function injectDropdownStyles() {
  if (document.getElementById('lue-dropdown-styles')) return;
  const style = document.createElement('style');
  style.id = 'lue-dropdown-styles';
  style.textContent = `
    .user-dropdown { position: relative; }
    .user-dropdown-trigger {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; color: var(--white);
      background: transparent; border: none; cursor: pointer;
      border-radius: var(--radius); transition: background .15s;
      font-family: var(--font); font-size: 13px;
    }
    .user-dropdown-trigger:hover { background: var(--blue-mid); }
    .user-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--yellow); color: var(--blue);
      font-weight: 700; font-size: 13px;
      display: flex; align-items: center; justify-content: center;
    }
    .user-dropdown-menu {
      position: absolute; top: calc(100% + 8px); right: 0;
      background: var(--white); border: 1px solid var(--gray-100);
      border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,.15);
      min-width: 220px; z-index: 200; overflow: hidden;
      animation: ddFade .15s ease;
    }
    @keyframes ddFade { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
    .dropdown-user-info { padding: 14px 16px; background: var(--blue-light); }
    .dropdown-name  { font-weight: 700; font-size: 14px; color: var(--blue); }
    .dropdown-email { font-size: 11px; color: var(--gray-400); margin-top: 2px; }
    .dropdown-role-badge {
      display: inline-block; margin-top: 6px;
      background: var(--yellow-light); color: var(--yellow-dark);
      font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 10px;
    }
    .dropdown-divider { height: 1px; background: var(--gray-100); }
    .dropdown-item {
      display: flex; align-items: center; gap: 10px;
      padding: 11px 16px; font-size: 13px; font-weight: 500;
      color: var(--gray-800); transition: background .12s;
      text-decoration: none; width: 100%; background: none; border: none;
      cursor: pointer; font-family: var(--font); text-align: left;
    }
    .dropdown-item svg { width: 16px; height: 16px; color: var(--gray-400); flex-shrink: 0; }
    .dropdown-item:hover { background: var(--gray-50); color: var(--blue); }
    .dropdown-item:hover svg { color: var(--blue); }
    .dropdown-signout { color: var(--red, #C0392B); }
    .dropdown-signout svg { color: var(--red, #C0392B); }
    .dropdown-signout:hover { background: var(--red-light, #FDECEA); }
  `;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════════════════════════════════
   2. SEARCH BAR
═══════════════════════════════════════════════════════════════════ */

function initSearch() {
  const searchInput = document.querySelector('.search-bar input');
  const searchBtn   = document.querySelector('.search-btn');
  if (!searchInput || !searchBtn) return;

  // Search on button click
  searchBtn.addEventListener('click', function () {
    performSearch(searchInput.value.trim());
  });

  // Search on Enter key
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') performSearch(searchInput.value.trim());
  });

  // Live search hint — highlight matching product cards
  searchInput.addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();
    highlightMatchingProducts(query);
  });

  // Clear highlight when search is emptied
  searchInput.addEventListener('blur', function () {
    if (!this.value.trim()) clearProductHighlights();
  });
}

function performSearch(query) {
  if (!query) {
    lue_toast('Please enter a search term.', 'info');
    return;
  }
  // In a full backend app this would call an API.
  // For this prototype, scroll to the first matching product card.
  const cards = document.querySelectorAll('.product-card, .upsell-card');
  let found = false;
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    if (text.includes(query.toLowerCase()) && !found) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '2px solid var(--yellow)';
      setTimeout(() => { card.style.outline = ''; }, 2000);
      found = true;
    }
  });
  if (!found) {
    lue_toast(`No products found for "${query}".`, 'info');
  }
}

function highlightMatchingProducts(query) {
  const cards = document.querySelectorAll('.product-card, .upsell-card');
  cards.forEach(card => {
    if (!query) {
      card.style.opacity = '';
      return;
    }
    const text = card.textContent.toLowerCase();
    card.style.opacity = text.includes(query) ? '1' : '0.45';
  });
}

function clearProductHighlights() {
  document.querySelectorAll('.product-card, .upsell-card').forEach(c => { c.style.opacity = ''; });
}

/* ═══════════════════════════════════════════════════════════════════
   3. CATEGORY CARDS
═══════════════════════════════════════════════════════════════════ */

function initCategoryCards() {
  // Map category names to a search query
  const categoryMap = {
    'Electronics':       'electronics',
    'Fashion':           'fashion',
    'Home & Kitchen':    'home',
    'Gaming':            'gaming',
  };

  document.querySelectorAll('.cat-item').forEach(function (card) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      const name  = card.querySelector('span')?.textContent?.trim() || '';
      const query = categoryMap[name] || name.toLowerCase();
      lue_toast(`Browsing ${name}…`, 'info');
      highlightMatchingProducts(query);
      const searchInput = document.querySelector('.search-bar input');
      if (searchInput) searchInput.value = query;
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   4. PRODUCT CARDS — Add to Cart & Wishlist
═══════════════════════════════════════════════════════════════════ */

function initProductCards() {
  // ── Add to Cart buttons ─────────────────────────────────────────
  document.querySelectorAll('.btn-add-cart, .btn-card-cart, .btn-upsell-add').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      handleAddToCart(btn);
    });
  });

  // ── Wishlist heart buttons ──────────────────────────────────────
  document.querySelectorAll('.wishlist-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      handleWishlist(btn);
    });
  });

  // ── Product card click → product detail page ───────────────────
  document.querySelectorAll('.product-card, .upsell-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      // Don't navigate if a button inside the card was clicked
      if (e.target.closest('button')) return;
      window.location.href = 'product-detail.html';
    });
  });
}

function handleAddToCart(btn) {
  // Build a cart item from the surrounding product card
  const card  = btn.closest('.product-card, .upsell-card');
  const name  = card?.querySelector('.product-name, .card-name, .upsell-name')?.textContent?.trim() || 'Product';
  const brand = card?.querySelector('.product-brand, .card-brand, .upsell-brand')?.textContent?.trim() || '';
  const priceText = card?.querySelector('.price-now, .card-price .now, .upsell-price')?.textContent?.trim() || 'R0';
  const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
  const id    = 'prod-' + name.replace(/\s+/g, '-').toLowerCase().slice(0, 20) + '-' + Date.now();

  lue_addToCart({ id, name, brand, price });

  // Update all cart badges
  const newCount = lue_getCart().reduce((s, i) => s + (i.quantity || 1), 0);
  document.querySelectorAll('[data-lue="cart-badge"], .badge').forEach(b => {
    b.textContent = newCount;
    b.style.display = 'flex';
  });

  // Visual feedback on button
  const original = btn.textContent;
  btn.textContent = '✓ Added!';
  btn.style.background = 'var(--green, #1A8A3C)';
  btn.style.color      = 'var(--white, #fff)';
  setTimeout(() => {
    btn.textContent      = original;
    btn.style.background = '';
    btn.style.color      = '';
  }, 1800);

  lue_toast(`${name.slice(0, 30)} added to cart!`);
}

function handleWishlist(btn) {
  const card  = btn.closest('.product-card');
  const name  = card?.querySelector('.product-name')?.textContent?.trim() || 'Product';
  const priceText = card?.querySelector('.price-now')?.textContent?.trim() || 'R0';
  const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
  const id    = 'wish-' + name.replace(/\s+/g, '-').toLowerCase().slice(0, 20);

  const nowWishlisted = lue_toggleWishlist({ id, name, price });
  const heart = btn.querySelector('path');
  if (heart) {
    heart.setAttribute('fill',   nowWishlisted ? '#C0392B' : 'none');
    heart.setAttribute('stroke', nowWishlisted ? '#C0392B' : 'currentColor');
  }
  lue_toast(nowWishlisted ? `${name.slice(0, 25)} saved to wishlist!` : 'Removed from wishlist.');
}

/* ═══════════════════════════════════════════════════════════════════
   5. BRAND PILLS
═══════════════════════════════════════════════════════════════════ */

function initBrandPills() {
  document.querySelectorAll('.brand-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.brand-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const brand = pill.textContent.trim();
      if (brand === 'All Brands') {
        clearProductHighlights();
      } else {
        highlightMatchingProducts(brand.toLowerCase());
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   6. SELL BUTTON
   If user is logged in as a seller → go to create-listing
   If buyer → show a prompt suggesting they switch role
   If not logged in → redirect to signup
═══════════════════════════════════════════════════════════════════ */

function initSellButton() {
  const sellButtons = document.querySelectorAll('.btn-sell, .float-sell');
  sellButtons.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const session = lue_getSession();
      if (!session) {
        lue_toast('Please sign in or create an account to start selling.', 'info');
        setTimeout(() => { window.location.href = _page('signup.html'); }, 1200);
        return;
      }
      if (session.role === 'seller') {
        window.location.href = _page('create-listing.html');
      } else {
        // Buyer trying to sell — offer role switch
        const confirmed = confirm(
          'Your account is currently set to Buyer.\n\n' +
          'Would you like to switch to a Seller account to list products?\n\n' +
          'You can switch back at any time in your Profile settings.'
        );
        if (confirmed) {
          // Update role in both users array and session
          const users = lue_getUsers();
          const idx   = users.findIndex(u => u.id === session.id);
          if (idx !== -1) {
            users[idx].role = 'seller';
            lue_saveUsers(users);
            const updated = { ...session, role: 'seller' };
            lue_setSession(updated);
          }
          lue_toast('Account switched to Seller! Redirecting to create listing…', 'success');
          setTimeout(() => { window.location.href = _page('create-listing.html'); }, 1500);
        }
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   7. MINI LOGIN MODAL
   A lightweight quick-login popup that appears when the user
   clicks Sign In from the header, so they don't have to leave the page.
   On successful login it refreshes the header without a page reload.
═══════════════════════════════════════════════════════════════════ */

function initHeaderSignIn() {
  // Only inject the modal if user is not already logged in
  if (lue_isLoggedIn()) return;

  injectMiniLoginModal();

  // Attach click handler to the Sign In header action
  const signInBtn = document.getElementById('header-signin');
  if (signInBtn) {
    signInBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openMiniLogin();
    });
  }
}

function injectMiniLoginModal() {
  if (document.getElementById('lue-mini-login')) return;

  const modal = document.createElement('div');
  modal.id    = 'lue-mini-login';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Quick sign in');
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="mml-overlay" onclick="closeMiniLogin()"></div>
    <div class="mml-panel">
      <button class="mml-close" onclick="closeMiniLogin()" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="mml-logo">LinkUp<span>Express</span></div>
      <h2 class="mml-title">Welcome back</h2>
      <p class="mml-sub">Sign in to your account to continue shopping.</p>

      <div id="mml-error" class="mml-error" style="display:none;"></div>

      <form id="mml-form" novalidate>
        <div class="mml-group">
          <label for="mml-email">Email address</label>
          <input type="email" id="mml-email" placeholder="you@example.com" autocomplete="email" required />
        </div>
        <div class="mml-group">
          <label for="mml-password">Password</label>
          <div class="mml-pwd-wrap">
            <input type="password" id="mml-password" placeholder="Your password" autocomplete="current-password" required />
            <button type="button" class="mml-eye" onclick="toggleMmlPwd()" aria-label="Show password">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>
        <button type="submit" class="mml-submit" id="mml-submit">Sign In</button>
      </form>

      <div class="mml-divider"><span>New to LinkUp Express?</span></div>
      <a href="javascript:void(0)" onclick="location.href=_page('signup.html')" class="mml-register-btn">Create a free account</a>
    </div>`;

  document.body.appendChild(modal);
  injectMiniLoginStyles();

  // Form submit handler
  document.getElementById('mml-form').addEventListener('submit', function (e) {
    e.preventDefault();
    handleMiniLogin();
  });
}

function openMiniLogin() {
  const modal = document.getElementById('lue-mini-login');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => { document.getElementById('mml-email')?.focus(); }, 80);
}

function closeMiniLogin() {
  const modal = document.getElementById('lue-mini-login');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  // Clear form and errors
  document.getElementById('mml-email').value    = '';
  document.getElementById('mml-password').value = '';
  const err = document.getElementById('mml-error');
  err.style.display = 'none';
  err.textContent   = '';
}

function toggleMmlPwd() {
  const input = document.getElementById('mml-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function handleMiniLogin() {
  const email    = document.getElementById('mml-email').value.trim();
  const password = document.getElementById('mml-password').value;
  const errBox   = document.getElementById('mml-error');
  const submitBtn = document.getElementById('mml-submit');

  errBox.style.display = 'none';

  // Loading state
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Signing in…';

  setTimeout(function () {
    const result = lue_login(email, password);

    if (!result.ok) {
      errBox.textContent   = result.error;
      errBox.style.display = 'block';
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Sign In';
      return;
    }

    // Success
    submitBtn.textContent = '✓ Signed in!';
    setTimeout(function () {
      closeMiniLogin();
      updateHeaderAuthUI();
      lue_syncHeader();
      lue_toast(`Welcome back, ${result.user.fullName.split(' ')[0]}!`);
    }, 600);
  }, 400); // brief delay to feel responsive
}

// Expose modal controls for inline onclick use
window.openMiniLogin  = openMiniLogin;
window.closeMiniLogin = closeMiniLogin;
window.toggleMmlPwd   = toggleMmlPwd;

/** Inject mini-login modal styles */
function injectMiniLoginStyles() {
  if (document.getElementById('lue-mml-styles')) return;
  const s = document.createElement('style');
  s.id = 'lue-mml-styles';
  s.textContent = `
    #lue-mini-login {
      position: fixed; inset: 0; z-index: 9000;
      display: flex; align-items: center; justify-content: center;
    }
    .mml-overlay {
      position: absolute; inset: 0;
      background: rgba(10,36,99,0.55); backdrop-filter: blur(2px);
    }
    .mml-panel {
      position: relative; background: #fff; border-radius: 14px;
      padding: 36px 32px; width: 100%; max-width: 400px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
      animation: mmlSlide .28s cubic-bezier(.34,1.56,.64,1);
      z-index: 1;
    }
    @keyframes mmlSlide { from { opacity:0; transform:scale(.92) translateY(16px); } }
    .mml-close {
      position: absolute; top: 14px; right: 14px;
      width: 32px; height: 32px; border-radius: 50%;
      background: #F7F8FA; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .12s;
    }
    .mml-close:hover { background: #EDEEF0; }
    .mml-close svg  { width: 16px; height: 16px; color: #5A5C63; }
    .mml-logo {
      font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 700;
      color: #0A2463; margin-bottom: 16px;
    }
    .mml-logo span { color: #F5C518; }
    .mml-title { font-family: 'Barlow Condensed', sans-serif; font-size: 26px; font-weight: 700; color: #0A2463; margin-bottom: 4px; }
    .mml-sub { font-size: 13px; color: #9A9CA2; margin-bottom: 20px; }
    .mml-error {
      background: #FDECEA; color: #C0392B; border: 1px solid rgba(192,57,43,.25);
      border-radius: 6px; padding: 10px 14px; font-size: 13px; font-weight: 500;
      margin-bottom: 14px;
    }
    .mml-group { margin-bottom: 14px; display: flex; flex-direction: column; gap: 5px; }
    .mml-group label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .6px; color: #5A5C63;
    }
    .mml-group input {
      width: 100%; padding: 10px 14px; border: 1.5px solid #D8D9DC; border-radius: 6px;
      font-family: 'Barlow', sans-serif; font-size: 14px; outline: none;
      transition: border-color .15s, box-shadow .15s;
    }
    .mml-group input:focus { border-color: #0A2463; box-shadow: 0 0 0 3px rgba(10,36,99,.10); }
    .mml-pwd-wrap { position: relative; }
    .mml-pwd-wrap input { padding-right: 44px; }
    .mml-eye {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; color: #9A9CA2;
      padding: 2px; transition: color .12s;
    }
    .mml-eye:hover { color: #0A2463; }
    .mml-eye svg { width: 16px; height: 16px; display: block; }
    .mml-submit {
      width: 100%; padding: 13px; background: #F5C518; color: #0A2463;
      font-family: 'Barlow', sans-serif; font-size: 15px; font-weight: 700;
      border: none; border-radius: 6px; cursor: pointer; transition: background .15s;
      margin-top: 4px;
    }
    .mml-submit:hover:not(:disabled) { background: #D4A80E; }
    .mml-submit:disabled { opacity: .65; cursor: not-allowed; }
    .mml-divider {
      display: flex; align-items: center; gap: 12px;
      margin: 18px 0 14px; color: #9A9CA2; font-size: 12px;
    }
    .mml-divider::before, .mml-divider::after {
      content: ''; flex: 1; height: 1px; background: #EDEEF0;
    }
    .mml-register-btn {
      display: block; text-align: center; padding: 12px;
      background: #0A2463; color: #fff;
      font-family: 'Barlow', sans-serif; font-size: 14px; font-weight: 700;
      border-radius: 6px; text-decoration: none; transition: background .15s;
    }
    .mml-register-btn:hover { background: #1B3A8C; }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════════════
   8. SCROLL TO TOP
═══════════════════════════════════════════════════════════════════ */

function initScrollToTop() {
  // Create the button
  const btn = document.createElement('button');
  btn.id    = 'lue-scroll-top';
  btn.setAttribute('aria-label', 'Scroll to top');
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
    <polyline points="18 15 12 9 6 15"/>
  </svg>`;
  btn.style.cssText = [
    'position:fixed', 'bottom:90px', 'right:28px',
    'width:44px', 'height:44px', 'border-radius:50%',
    'background:var(--blue)', 'color:var(--white)',
    'display:none', 'align-items:center', 'justify-content:center',
    'box-shadow:0 4px 16px rgba(10,36,99,.30)',
    'border:none', 'cursor:pointer',
    'transition:opacity .2s, transform .2s',
    'z-index:190',
  ].join(';');
  document.body.appendChild(btn);

  btn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  window.addEventListener('scroll', function () {
    const show = window.scrollY > 400;
    btn.style.display   = show ? 'flex' : 'none';
    btn.style.opacity   = show ? '1'    : '0';
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════════════
   KEYBOARD ACCESSIBILITY
   Close the mini-login modal or user dropdown on Escape key
═══════════════════════════════════════════════════════════════════ */

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeMiniLogin();
    closeUserDropdown();
  }
});
