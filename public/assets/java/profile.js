

'use strict';



const originalValues = {};



document.addEventListener('DOMContentLoaded', async function () {
  await lue_initSession();
  guardLogin();
  lue_syncHeader();
  populateProfileFromSession();
  await populateStats();
  initSidebarNav();
  initSectionEditing();
  initRoleCards();
  initPasswordToggles();
  initPasswordStrength();
  initAvatarUpload();
  initDeleteAccount();
  trackScrollForSidebar();
});


function guardLogin() {
  if (!lue_isLoggedIn()) {
    // Redirect to sign-in, passing the profile page as the return destination
    window.location.href = 'signup.html#login';
  }
}



function populateProfileFromSession() {
  var session = lue_getSession();
  if (!session) {
    // Not logged in — redirect to signup
    window.location.href = 'signup.html';
    return;
  }

  var fullName    = session.fullName || '';
  var nameParts   = fullName.trim().split(' ');
  var firstName   = nameParts[0] || '';
  var lastName    = nameParts.slice(1).join(' ') || '';
  var displayName = firstName + (lastName ? ' ' + lastName.charAt(0) + '.' : '');
  var initials    = (firstName.charAt(0) + (lastName ? lastName.charAt(0) : '')).toUpperCase() || '?';

  // ── Avatar ────────────────────────────────────────────────────
  setEl('avatar-initials', initials);

  // ── Sidebar ───────────────────────────────────────────────────
  setEl('sidebar-name',  fullName);
  setEl('sidebar-email', session.email || '');

  var roleBadge = document.getElementById('sidebar-role-badge');
  if (roleBadge) {
    roleBadge.textContent = session.role === 'seller' ? '🏪 Seller' : '🛍️ Buyer';
    roleBadge.className   = 'role-badge ' + (session.role === 'seller' ? 'seller' : 'buyer');
  }

  // ── Member since ──────────────────────────────────────────────
  var memberSince = document.getElementById('member-since');
  if (memberSince && session.createdAt) {
    var d = new Date(session.createdAt);
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    memberSince.textContent = 'Member since ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ── Stats ─────────────────────────────────────────────────────
  setEl('stat-orders',   session.totalOrders  || 0);
  setEl('stat-listings', session.totalListings || 0);
  setEl('stat-saved',    session.totalSpent ? 'R ' + Number(session.totalSpent).toLocaleString('en-ZA') : '—');

  // ── Personal details ──────────────────────────────────────────
  setEl('v-first-name',   firstName   || '—');
  setEl('v-last-name',    lastName    || '—');
  setEl('v-display-name', displayName || '—');

  setInput('i-first-name',   firstName);
  setInput('i-last-name',    lastName);
  setInput('i-display-name', displayName);

  // ── Contact ───────────────────────────────────────────────────
  setEl('v-email', session.email || '—');
  setEl('v-phone', session.phone || '—');

  setInput('i-email', session.email || '');
  setInput('i-phone', session.phone || '');

  // ── Address ───────────────────────────────────────────────────
  // Address fields stored separately in session
  // Load address — check both new DB column names and legacy field names
  var addrStreet   = session.address_street   || session.street   || '';
  var addrCity     = session.address_city     || session.city     || '';
  var addrPostal   = session.address_postal   || session.postal   || '';
  var addrProvince = session.address_province || session.province || '';
  var addrCountry  = session.address_country  || session.country  || 'South Africa';

  if (addrStreet)   { setEl('v-street',   addrStreet);   setInput('i-street',   addrStreet); }
  if (addrCity)     { setEl('v-city',     addrCity);     setInput('i-city',     addrCity); }
  if (addrPostal)   { setEl('v-postal',   addrPostal);   setInput('i-postal',   addrPostal); }
  if (addrCountry)  { setEl('v-country',  addrCountry);  setInput('i-country',  addrCountry); }
  if (addrProvince) {
    setEl('v-province', addrProvince);
    var provSel = document.getElementById('i-province');
    if (provSel) provSel.value = addrProvince;
  }
  if (session.country)  { setEl('v-country',   session.country);  setInput('i-country',  session.country); }
  // DOB
  if (session.dob) {
    setEl('v-dob', formatDOBDisplay(session.dob));
    setInput('i-dob', session.dob);
  }

  // ── Role card ──────────────────────────────────
  applyRoleCard(session.role || 'buyer');
}

function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}



async function populateStats() {
  const session  = lue_getSession();
  const cart     = lue_getCart();

  // Defaults while we wait for the API
  let orders = 0;
  let saved  = 0;
  let activeListings = 0;

  // ── Fetch LIVE stats from the database ─────────────────────────
  if (session && window.lue_apiUrl) {
    try {
      const res = await fetch(lue_apiUrl('profile') + '?action=get&user_id=' + encodeURIComponent(session.id), {
        method: 'GET',
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (data.ok && data.data) {
        orders = data.data.total_orders || 0;
        saved  = data.data.total_spent  || 0;
        activeListings = data.data.active_listings || 0;
      }
    } catch (e) {
      console.error('Could not load profile stats:', e);
    }
  }

  // Orders placed
  setEl('stat-orders', orders);

  // Active listings (sellers) or items in cart (buyers)
  const listingsLabelEl = document.querySelector('#stat-listings').nextElementSibling
    || document.querySelector('#stat-listings ~ .stat-label');
  const statListingsCard = document.getElementById('stat-listings')
    ? document.getElementById('stat-listings').closest('.stat-card')
    : null;

  if (session && session.role === 'seller') {
    setEl('stat-listings', activeListings);
    if (statListingsCard) {
      const label = statListingsCard.querySelector('.stat-label');
      if (label) label.textContent = 'Active listings';
    }
  } else {
    setEl('stat-listings', cart.length);
    if (statListingsCard) {
      const label = statListingsCard.querySelector('.stat-label');
      if (label) label.textContent = 'Items in cart';
    }
  }

  // Total saved
  setEl('stat-saved', saved > 0 ? 'R\u00A0' + Number(saved).toLocaleString('en-ZA') : '—');
}



function initSidebarNav() {
  document.querySelectorAll('.sidebar-nav-item').forEach(function (item) {
    item.setAttribute('tabindex', '0');
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
    });
  });
}

/**
 * Smooth-scroll to a section and update the sidebar active state.
 * Exposed globally for the inline onclick="scrollTo('personal')" calls.
 * @param {string} sectionId
 */
function scrollToSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) return;

  // Offset for sticky header (~80px)
  const top = target.getBoundingClientRect().top + window.scrollY - 90;
  window.scrollTo({ top, behavior: 'smooth' });

  // Update sidebar active
  setSidebarActive(sectionId);
}

// Override window.scrollTo only for our custom function — keep native intact
window.scrollTo = (function (nativeScrollTo) {
  return function (optionsOrX, y) {
    if (typeof optionsOrX === 'object') {
      nativeScrollTo.call(window, optionsOrX);
    } else {
      nativeScrollTo.call(window, optionsOrX, y);
    }
  };
})(window.scrollTo);

// Expose the section-scroll function for inline onclick handlers
window.scrollTo = scrollToSection; // profile.html uses scrollTo(id) — repoint it

function setSidebarActive(sectionId) {
  document.querySelectorAll('.sidebar-nav-item').forEach(function (item) {
    item.classList.remove('active');
    if (item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + sectionId + "'")) {
      item.classList.add('active');
    }
  });
}

/** Watch scroll position and keep the sidebar highlight in sync */
function trackScrollForSidebar() {
  const sections = ['personal', 'contact', 'address', 'role', 'password', 'danger'];
  window.addEventListener('scroll', function () {
    let current = sections[0];
    sections.forEach(function (id) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 120) current = id;
    });
    setSidebarActive(current);
  }, { passive: true });
}



function initSectionEditing() {
  
}

/**
 * Enter edit mode for a section.
 * Saves a snapshot of current values so Cancel can restore them.
 * @param {string} id — section card ID
 */
function editSection(id) {
  const card = document.getElementById(id);
  if (!card) return;

  // Snapshot current field values for cancel
  originalValues[id] = {};
  card.querySelectorAll('input, select, textarea').forEach(function (field) {
    originalValues[id][field.id] = field.value;
  });

  card.classList.add('editing');

  // Password section: show the hidden input wrappers
  if (id === 'password') {
    card.querySelectorAll('.pwd-input-wrap.field-input').forEach(function (el) { el.style.display = 'flex'; });
    const strengthEl = document.getElementById('pwd-strength');
    if (strengthEl) strengthEl.style.display = 'flex';
  }

  // Focus the first visible input
  const firstInput = card.querySelector('input.field-input:not([disabled]), select.field-input');
  if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
}
window.editSection = editSection;

/**
 * Exit edit mode without saving — restores original values.
 * @param {string} id
 */
function cancelEdit(id) {
  const card = document.getElementById(id);
  if (!card) return;

  // Restore snapshots
  const snap = originalValues[id] || {};
  Object.keys(snap).forEach(function (fieldId) {
    const el = document.getElementById(fieldId);
    if (el) el.value = snap[fieldId];
  });

  card.classList.remove('editing');
  clearSectionErrors(card);

  if (id === 'password') {
    const strengthEl = document.getElementById('pwd-strength');
    if (strengthEl) strengthEl.style.display = 'none';
    // Clear pwd inputs
    ['i-current-pwd', 'i-new-pwd', 'i-confirm-pwd'].forEach(function (pid) {
      const el = document.getElementById(pid);
      if (el) el.value = '';
    });
    resetStrengthBars();
  }
}
window.cancelEdit = cancelEdit;

/**
 * Validate and save a section's fields to localStorage session.
 * @param {string} id
 */
function saveSection(id) {
  const card = document.getElementById(id);
  if (!card) return;
  clearSectionErrors(card);

  let hasError = false;

  // ── PERSONAL ──────────────────────────────────────
  if (id === 'personal') {
    const firstName   = getVal('i-first-name');
    const lastName    = getVal('i-last-name');
    const displayName = getVal('i-display-name');
    const dob         = getVal('i-dob');

    if (!firstName || firstName.length < 2) {
      showFieldError('i-first-name', 'First name must be at least 2 characters.'); hasError = true;
    }
    if (!lastName || lastName.length < 1) {
      showFieldError('i-last-name', 'Please enter your last name.'); hasError = true;
    }
    if (hasError) return;

    const fullName = firstName + ' ' + lastName;

    // Update read views
    setEl('v-first-name',   firstName);
    setEl('v-last-name',    lastName);
    setEl('v-display-name', displayName || firstName + ' ' + lastName.charAt(0) + '.');
    if (dob) setEl('v-dob', formatDOBDisplay(dob));

    // Save to session and localStorage
    updateSessionField('fullName',    fullName);
    updateSessionField('displayName', displayName || firstName + ' ' + lastName.charAt(0) + '.');
    if (dob) updateSessionField('dob', dob);

    // Live sidebar / avatar
    setEl('sidebar-name', fullName);
    updateAvatarInitials(firstName, lastName);

    showToast('Personal details saved!');
  }

  // ── CONTACT ─────────────────────────────────────
  else if (id === 'contact') {
    const email    = getVal('i-email');
    const phone    = getVal('i-phone');
    const altPhone = getVal('i-alt-phone');

    if (!lue_isValidEmail(email)) {
      showFieldError('i-email', 'Please enter a valid email address.'); hasError = true;
    }
    if (!lue_isValidPhone(phone)) {
      showFieldError('i-phone', 'Enter a valid SA phone number, e.g. 071 234 5678.'); hasError = true;
    }
    if (altPhone && !lue_isValidPhone(altPhone)) {
      showFieldError('i-alt-phone', 'Enter a valid SA phone number or leave blank.'); hasError = true;
    }
    if (hasError) return;

    setEl('v-email', email);
    setEl('v-phone', phone);
    const altEl = document.getElementById('v-alt-phone');
    if (altEl) {
      altEl.textContent = altPhone || 'Not provided';
      altEl.className   = 'field-value' + (altPhone ? '' : ' empty');
    }

    updateSessionField('email', email);
    updateSessionField('phone', phone);

    setEl('sidebar-email', email);
    showToast('Contact information saved!');
  }

  // ── ADDRESS ────────────────────────────────────
  else if (id === 'address') {
    var street   = getVal('i-street');
    var city     = getVal('i-city');
    var postal   = getVal('i-postal');
    var provEl   = document.getElementById('i-province');
    var province = provEl ? provEl.options[provEl.selectedIndex].text : '';
    var provVal  = provEl ? provEl.value : '';
    var country  = getVal('i-country') || 'South Africa';

    if (!street || street.length < 3) {
      showFieldError('i-street', 'Please enter a valid street address.'); hasError = true;
    }
    if (!city || city.length < 2) {
      showFieldError('i-city', 'Please enter your city.'); hasError = true;
    }
    if (!postal || !/^\d{4}$/.test(postal.trim())) {
      showFieldError('i-postal', 'Enter a valid 4-digit SA postal code.'); hasError = true;
    }
    if (hasError) return;

    // Update read views
    setEl('v-street',   street);
    setEl('v-city',     city);
    setEl('v-postal',   postal);
    setEl('v-province', province || provVal || '—');
    setEl('v-country',  country);

    // Save address to database using correct column names
    var session = lue_getSession();
    if (session && window.lue_apiUrl) {
      var uid = session.id;
      fetch(lue_apiUrl('profile') + '?action=update&user_id=' + encodeURIComponent(uid), {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          user_id:          uid,
          address_street:   street,
          address_city:     city,
          address_postal:   postal,
          address_province: provVal || province,
          address_country:  country
        })
      }).then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.ok) {
            // Update in-memory session with new address fields
            var s = lue_getSession();
            if (s) {
              s.address_street   = street;
              s.address_city     = city;
              s.address_postal   = postal;
              s.address_province = provVal || province;
              s.address_country  = country;
              // Combined for backwards compatibility
              s.address = [street, city, postal, province || provVal, country].filter(Boolean).join(', ');
              lue_setSession(s);
            }
          } else {
            showToast('Could not save address: ' + (d.error || 'Unknown error'), 'error');
          }
        })
        .catch(function(e) { showToast('Server not reachable', 'error'); });
    }

    showToast('Delivery address saved!');
  }

  // ── PASSWORD ─────────────────────────
  else if (id === 'password') {
    const currentPwd = document.getElementById('i-current-pwd')?.value || '';
    const newPwd     = document.getElementById('i-new-pwd')?.value || '';
    const confirmPwd = document.getElementById('i-confirm-pwd')?.value || '';

    if (!currentPwd) {
      showFieldError('i-current-pwd', 'Please enter your current password.'); hasError = true;
    } else {
      // Verify current password matches the stored hash
      const session = lue_getSession();
      const users   = lue_getUsers();
      const user    = users.find(function (u) { return session && u.id === session.id; });
      if (user && user.passwordHash !== lue_hashPassword(currentPwd)) {
        showFieldError('i-current-pwd', 'Current password is incorrect.'); hasError = true;
      }
    }
    if (newPwd.length < LUE.MIN_PASSWORD_LENGTH) {
      showFieldError('i-new-pwd', `New password must be at least ${LUE.MIN_PASSWORD_LENGTH} characters.`); hasError = true;
    }
    if (newPwd && confirmPwd !== newPwd) {
      showFieldError('i-confirm-pwd', 'Passwords do not match.'); hasError = true;
    }
    if (hasError) return;

    // Update the stored password hash
    const session = lue_getSession();
    const users   = lue_getUsers();
    const idx     = users.findIndex(function (u) { return session && u.id === session.id; });
    if (idx !== -1) {
      users[idx].passwordHash = lue_hashPassword(newPwd);
      lue_saveUsers(users);
    }

    // Clear fields and hide strength meter
    ['i-current-pwd', 'i-new-pwd', 'i-confirm-pwd'].forEach(function (pid) {
      const el = document.getElementById(pid);
      if (el) el.value = '';
    });
    resetStrengthBars();
    const strengthEl = document.getElementById('pwd-strength');
    if (strengthEl) strengthEl.style.display = 'none';

    showToast('Password updated successfully!');
  }

  if (!hasError) {
    card.classList.remove('editing');
  }
}
window.saveSection = saveSection;

/* ── Field helpers ─────────────────── */

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function showFieldError(inputId, message) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.style.borderColor = 'var(--red, #C0392B)';
  el.style.boxShadow   = '0 0 0 3px rgba(192,57,43,.12)';

  // Remove any existing error for this field
  const existing = el.parentNode.querySelector('.profile-field-err');
  if (existing) existing.remove();

  const err = document.createElement('div');
  err.className = 'profile-field-err';
  err.textContent = message;
  err.style.cssText = 'font-size:11px;color:#C0392B;font-weight:600;margin-top:4px;';
  el.parentNode.appendChild(err);
}

function clearSectionErrors(card) {
  card.querySelectorAll('.profile-field-err').forEach(function (e) { e.remove(); });
  card.querySelectorAll('input, select, textarea').forEach(function (f) {
    f.style.borderColor = '';
    f.style.boxShadow   = '';
  });
}

/**
 * Update a single field in both the session and the users array.
 * @param {string} field
 * @param {string} value
 */
function updateSessionField(field, value) {
  var session = lue_getSession();
  if (!session) return;

  // Update the cached session
  var updated = Object.assign({}, session);
  updated[field] = value;
  lue_setSession(updated);

  // Persist to database
  if (window.lue_apiUrl) {
    var payload = { user_id: session.id };
    payload[field] = value;
    fetch(lue_apiUrl('profile') + '?action=update&user_id=' + encodeURIComponent(session.id), {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body:        JSON.stringify(payload)
    }).then(function(r) { return r.json(); })
      .then(function(d) { if (!d.ok) console.warn('Profile DB update warning:', d.error); })
      .catch(function(e) { console.warn('Profile API not reachable:', e.message); });
  }
}

function formatDOBDisplay(dobStr) {
  // Accepts YYYY-MM-DD → "15 March 1992"
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const parts  = dobStr.split('-');
  if (parts.length === 3) {
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parts[0];
    if (!isNaN(d) && !isNaN(m) && months[m]) return `${d} ${months[m]} ${y}`;
  }
  return dobStr;
}



function updateAvatarInitials(first, last) {
  const initials = ((first || '').charAt(0) + (last || '').charAt(0)).toUpperCase();
  setEl('avatar-initials', initials);
}

// Exposed for oninput="liveUpdate()" on the name fields
function liveUpdate() {
  const first = getVal('i-first-name');
  const last  = getVal('i-last-name');
  if (first || last) updateAvatarInitials(first, last);
}
window.liveUpdate = liveUpdate;

// Exposed for oninput="updateSidebarEmail()" on the email field
function updateSidebarEmail() {
  const email = getVal('i-email');
  if (email) setEl('sidebar-email', email);
}
window.updateSidebarEmail = updateSidebarEmail;



function initRoleCards() {
  document.querySelectorAll('.role-option').forEach(function (card) {
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });
}

function applyRoleCard(role) {
  const buyerCard  = document.getElementById('role-buyer-card');
  const sellerCard = document.getElementById('role-seller-card');
  if (!buyerCard || !sellerCard) return;

  buyerCard.classList.toggle('selected',  role === 'buyer');
  sellerCard.classList.toggle('selected', role === 'seller');

  const buyerRadio  = buyerCard.querySelector('input[type="radio"]');
  const sellerRadio = sellerCard.querySelector('input[type="radio"]');
  if (buyerRadio)  buyerRadio.checked  = role === 'buyer';
  if (sellerRadio) sellerRadio.checked = role === 'seller';
}

/**
 * Select a role card, update the session, and update the sidebar badge.
 * @param {string} role 'buyer' | 'seller'
 */
function selectRole(role) {
  applyRoleCard(role);

  // Update localStorage
  updateSessionField('role', role);

  // Call PHP API to update role in database
  var session = lue_getSession();
  if (session && window.lue_apiUrl) {
    fetch(lue_apiUrl('profile') + '?action=switch_role&user_id=' + encodeURIComponent(session.id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ user_id: session.id, role: role })
    }).then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) { console.log('Role updated to', role); }
        else { console.warn('Role update failed:', d.error); }
      })
      .catch(function(e) { console.warn('Role API not reachable:', e.message); });
  }

  // Update sidebar role badge
  const badge = document.getElementById('sidebar-role-badge');
  if (badge) {
    badge.textContent = role === 'seller' ? '🏪 Seller' : '🛍️ Buyer';
    badge.className   = 'role-badge ' + role;
  }

  // Update stats strip label
  const statCards = document.querySelectorAll('.stat-card');
  if (statCards.length >= 3) {
    statCards[2].querySelector('.stat-label').textContent =
      role === 'seller' ? 'Active listings' : 'Items in cart';
  }

  showToast(`Account type changed to ${role === 'seller' ? 'Seller' : 'Buyer'}!`);
}
window.selectRole = selectRole;



function initPasswordToggles() {
  // Toggles use inline onclick="togglePwd('inputId')" — just expose the function.
}

function togglePwd(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';

  // Swap the eye icon on the associated toggle button
  const btn = input.parentNode?.querySelector('.pwd-toggle');
  if (btn) {
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.innerHTML = input.type === 'text'
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
           <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
           <line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
           <circle cx="12" cy="12" r="3"/>`;
    }
  }
}
window.togglePwd = togglePwd;



function initPasswordStrength() {
  const newPwd = document.getElementById('i-new-pwd');
  if (newPwd) {
    newPwd.addEventListener('input', function () { checkStrength(this.value); });
  }
}

function checkStrength(pwd) {
  const { score, label } = lue_passwordStrength(pwd);
  const bars  = [document.getElementById('bar1'), document.getElementById('bar2'), document.getElementById('bar3')];
  const lbl   = document.getElementById('strength-label');
  if (!bars[0]) return;

  const colourMap = { 1: 'weak', 2: 'fair', 3: 'strong' };
  const textMap   = { 1: '#C0392B', 2: '#F26522', 3: '#1A8A3C' };

  bars.forEach(function (b) { if (b) b.className = 'bar'; });

  if (score >= 1 && bars[0]) bars[0].classList.add(colourMap[score]);
  if (score >= 2 && bars[1]) bars[1].classList.add(colourMap[score]);
  if (score >= 3 && bars[2]) bars[2].classList.add(colourMap[score]);

  if (lbl) {
    lbl.textContent = label;
    lbl.style.color = score > 0 ? (textMap[score] || '#9A9CA2') : '#9A9CA2';
  }
}
window.checkStrength = checkStrength;

function resetStrengthBars() {
  ['bar1','bar2','bar3'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.className = 'bar';
  });
  const lbl = document.getElementById('strength-label');
  if (lbl) { lbl.textContent = ''; lbl.style.color = ''; }
}



function initAvatarUpload() {
  const btn = document.querySelector('.avatar-edit-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    showToast('Profile photo upload coming soon!', 'info');
  });
}



function initDeleteAccount() {
  const deleteBtn = document.querySelector('.btn-danger');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () { confirmDelete(); });
  }
}

function confirmDelete() {
  // First confirmation
  const step1 = confirm(
    '⚠️  Are you sure you want to permanently delete your LinkUp Express account?\n\n' +
    'This will remove all your data, orders, and listings.\n\n' +
    'This action CANNOT be undone.'
  );
  if (!step1) return;

  // Second confirmation with stronger warning
  const step2 = confirm(
    'FINAL WARNING\n\n' +
    'Type "DELETE" in your mind and confirm below to permanently delete your account.\n\n' +
    'All data will be lost immediately.'
  );
  if (!step2) return;

  var session = lue_getSession();

  // Call PHP API to delete from database
  if (session && window.lue_apiUrl) {
    fetch(lue_apiUrl('profile') + '?action=delete&user_id=' + encodeURIComponent(session.id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ user_id: session.id })
    }).then(function(r) { return r.json(); })
      .then(function(d) { console.log('Account deleted from DB:', d); })
      .catch(function(e) { console.warn('Delete API not reachable:', e.message); });
  }

  // Clear session cache
  lue_clearSession();
  lue_clearCart();

  showToast('Account deleted. Redirecting…', 'error');
  setTimeout(function() { window.location.href = '../../index.html'; }, 1800);
}
window.confirmDelete = confirmDelete;



function showToast(msg, type) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');

  if (!toast) { lue_toast(msg, type || 'success'); return; }
  if (msgEl) msgEl.textContent = msg;

  if (type === 'error') {
    toast.style.background = 'var(--red, #C0392B)';
    toast.style.color      = '#fff';
  } else if (type === 'info') {
    toast.style.background = 'var(--blue-mid, #1B3A8C)';
    toast.style.color      = '#fff';
  } else {
    toast.style.background = '';
    toast.style.color      = '';
  }

  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
}
window.showToast = showToast;