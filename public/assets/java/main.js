

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

function initHeaderSignIn() {
  // Only inject the modal if user is not already logged in
  if (lue_isLoggedIn()) return;


  // Sign In button goes directly to signup/login page
  const signInBtn = document.getElementById('header-signin');
  if (signInBtn) {
    signInBtn.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.href = _page('signup.html');
    });
  }
}

/** Handle "+ Sell" button click — go to create-listing if logged in, else signup */
function handleSellClick() {
  if (lue_isLoggedIn()) {
    window.location.href = _page('create-listing.html');
  } else {
    window.location.href = _page('signup.html');
  }
}
window.handleSellClick = handleSellClick;