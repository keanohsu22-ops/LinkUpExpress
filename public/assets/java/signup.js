// Robustly redirect to the project's index.html regardless of current page depth
function _redirectToHome() {
  var href = window.location.href;
  if (href.includes('/public/')) {
    window.location.href = href.substring(0, href.indexOf('/public/')) + '/index.html';
  } else {
    var parts = href.split('/');
    parts.pop();
    window.location.href = parts.join('/') + '/index.html';
  }
}



'use strict';



document.addEventListener('DOMContentLoaded', async function () {
  await lue_initSession();
  // If user is already logged in redirect to homepage
  if (lue_isLoggedIn()) {
    _redirectToHome();
    return;
  }

  lue_syncHeader();
  initTabSwitcher();
  initRegisterForm();
  initLoginForm();
  initRoleCards();
  initPasswordToggles();
  initPasswordStrengthMeter();

  // Check URL hash to auto-open a tab — e.g. signup.html#login
  if (window.location.hash === '#login') {
    switchTab('login');
  }
});



/**
 * Switch between the Create Account and Log In panels.
 * @param {'signup'|'login'} tab
 */
function switchTab(tab) {
  const tabBtns    = document.querySelectorAll('.tab-btn');
  const panelSignup = document.getElementById('panel-signup');
  const panelLogin  = document.getElementById('panel-login');
  if (!panelSignup || !panelLogin) return;

  tabBtns.forEach(function (btn, i) {
    const isActive = (tab === 'signup' && i === 0) || (tab === 'login' && i === 1);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  panelSignup.classList.toggle('active', tab === 'signup');
  panelLogin.classList.toggle('active',  tab === 'login');

  // Clear all form errors when switching tabs
  [panelSignup, panelLogin].forEach(lue_clearAllErrors);

  // Update URL hash without reloading the page
  history.replaceState(null, '', tab === 'login' ? '#login' : '#');
}

// Expose for the inline onclick="switchTab(...)" calls in signup.html
window.switchTab = switchTab;

function initTabSwitcher() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(function (btn, i) {
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', i === 0 ? 'panel-signup' : 'panel-login');
    btn.addEventListener('click', function () {
      switchTab(i === 0 ? 'signup' : 'login');
    });
  });
}



function initRegisterForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    handleRegister(form);
  });

  // Real-time field validation on blur
  const fields = {
    'full-name': validateFullName,
    'phone':     validatePhone,
    'email-signup': validateEmail,
    'address':   validateAddress,
    'pwd-signup': validatePassword,
  };
  Object.entries(fields).forEach(function ([id, validator]) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('blur', function () { validator(el); });
      el.addEventListener('input', function () {
        if (el.style.borderColor === 'var(--red, #C0392B)') validator(el);
      });
    }
  });
}

async function handleRegister(formOrEvent) {
  if (formOrEvent && formOrEvent.preventDefault) formOrEvent.preventDefault();
  var form = (formOrEvent && formOrEvent.target) ? formOrEvent.target
           : (formOrEvent && formOrEvent.querySelector) ? formOrEvent
           : document.getElementById('signup-form');
  var submitBtn = form ? form.querySelector('[type="submit"]') : document.getElementById('signup-btn');

  var fullName  = (document.getElementById('full-name')    ? document.getElementById('full-name').value    : '').trim();
  var phone     = (document.getElementById('phone')        ? document.getElementById('phone').value        : '').trim();
  var email     = (document.getElementById('email-signup') ? document.getElementById('email-signup').value : '').trim();
  var address   = (document.getElementById('address')      ? document.getElementById('address').value      : '').trim();
  var password  = document.getElementById('pwd-signup')    ? document.getElementById('pwd-signup').value   : '';
  var roleInput = document.querySelector('input[name="role"]:checked');
  var role      = roleInput ? roleInput.value : 'buyer';

  lue_clearAllErrors(form);

  var hasError = false;
  if (!validateFullName(document.getElementById('full-name')))     hasError = true;
  if (!validatePhone(document.getElementById('phone')))            hasError = true;
  if (!validateEmail(document.getElementById('email-signup')))     hasError = true;
  if (!validateAddress(document.getElementById('address')))        hasError = true;
  if (!validatePassword(document.getElementById('pwd-signup')))    hasError = true;
  if (hasError) return;

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Creating account…';

  try {
    var res    = await fetch(lue_apiUrl('auth') + '?action=register', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body:        JSON.stringify({ fullName:fullName, phone:phone, email:email, address:address, password:password, role:role })
    });
    var result = await res.json();

    if (result.ok && result.data) {
      lue_setSession({
        id:               result.data.id,
        fullName:         result.data.fullName         || fullName,
        email:            result.data.email            || email,
        phone:            result.data.phone            || phone,
        role:             result.data.role             || role,
        address_street:   result.data.address_street   || address || '',
        address_city:     result.data.address_city     || '',
        address_postal:   result.data.address_postal   || '',
        address_province: result.data.address_province || '',
        address_country:  result.data.address_country  || 'South Africa'
      });
      submitBtn.textContent = '✓ Account created!';
      var firstName = (result.data.fullName || fullName).split(' ')[0];
      showFormBanner(form, 'Welcome to LinkUp Express, ' + firstName + '! Redirecting…', 'success');
      setTimeout(function() { _redirectToHome(); }, 1400);
    } else {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Create My Account';
      var errMsg = result.error || 'Registration failed. Please try again.';
      if (errMsg.toLowerCase().includes('email')) {
        lue_fieldError(document.getElementById('email-signup'), errMsg);
      } else {
        showFormBanner(form, errMsg, 'error');
      }
    }
  } catch(err) {
    console.error('Register error:', err);
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Create My Account';
    showFormBanner(form, 'Error: ' + (err.message || 'Cannot connect to server'), 'error');
  }
}



function validateFullName(el) {
  if (!el) return true;
  if (!el.value.trim() || el.value.trim().length < 2) {
    lue_fieldError(el, 'Please enter your full name (at least 2 characters).');
    return false;
  }
  lue_clearFieldError(el);
  return true;
}

function validatePhone(el) {
  if (!el) return true;
  if (!lue_isValidPhone(el.value)) {
    lue_fieldError(el, 'Enter a valid SA phone number, e.g. 071 234 5678.');
    return false;
  }
  lue_clearFieldError(el);
  return true;
}

function validateEmail(el) {
  if (!el) return true;
  if (!lue_isValidEmail(el.value)) {
    lue_fieldError(el, 'Please enter a valid email address.');
    return false;
  }
  lue_clearFieldError(el);
  return true;
}

function validateAddress(el) {
  if (!el) return true;
  if (!el.value.trim() || el.value.trim().length < 5) {
    lue_fieldError(el, 'Please enter your delivery address.');
    return false;
  }
  lue_clearFieldError(el);
  return true;
}

function validatePassword(el) {
  if (!el) return true;
  if (!el.value || el.value.length < LUE.MIN_PASSWORD_LENGTH) {
    lue_fieldError(el, `Password must be at least ${LUE.MIN_PASSWORD_LENGTH} characters.`);
    return false;
  }
  lue_clearFieldError(el);
  return true;
}



function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    handleLogin(form);
  });

  // Real-time blur validation
  const emailEl = document.getElementById('email-login');
  const pwdEl   = document.getElementById('pwd-login');
  if (emailEl) emailEl.addEventListener('blur', function () { validateEmail(emailEl); });
  if (pwdEl)   pwdEl.addEventListener('blur',   function () {
    if (!pwdEl.value) lue_fieldError(pwdEl, 'Please enter your password.');
    else lue_clearFieldError(pwdEl);
  });
}

async function handleLogin(formOrEvent) {
  // Accept either a form element or a submit event
  if (formOrEvent && formOrEvent.preventDefault) formOrEvent.preventDefault();
  var form = (formOrEvent && formOrEvent.target) ? formOrEvent.target
           : (formOrEvent && formOrEvent.querySelector) ? formOrEvent
           : document.getElementById('login-form');
  var submitBtn = form ? form.querySelector('[type="submit"]') : document.getElementById('login-btn');
  var email     = (document.getElementById('email-login') ? document.getElementById('email-login').value : '').trim();
  var password  = document.getElementById('pwd-login') ? document.getElementById('pwd-login').value : '';

  lue_clearAllErrors(form);

  // Validate
  var hasError = false;
  var emailEl  = document.getElementById('email-login');
  var pwdEl    = document.getElementById('pwd-login');
  if (!email || !email.includes('@')) {
    lue_fieldError(emailEl, 'Please enter a valid email address.');
    hasError = true;
  }
  if (!password) {
    lue_fieldError(pwdEl, 'Please enter your password.');
    hasError = true;
  }
  if (hasError) return;

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Signing in…';

  try {
    var res    = await fetch(lue_apiUrl('auth') + '?action=login', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body:        JSON.stringify({ email: email, password: password })
    });
    var result = await res.json();

    if (result.ok && result.data) {
      lue_setSession({
        id:               result.data.id,
        fullName:         result.data.fullName,
        email:            result.data.email,
        phone:            result.data.phone            || '',
        role:             result.data.role,
        address_street:   result.data.address_street   || '',
        address_city:     result.data.address_city     || '',
        address_postal:   result.data.address_postal   || '',
        address_province: result.data.address_province || '',
        address_country:  result.data.address_country  || 'South Africa'
      });
      submitBtn.textContent = '✓ Signed in!';
      var firstName = (result.data.fullName || '').split(' ')[0];
      showFormBanner(form, 'Welcome back, ' + firstName + '! Redirecting…', 'success');
      setTimeout(function() { _redirectToHome(); }, 1200);
    } else {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Log In to My Account';
      var errMsg = result.error || 'Login failed. Please check your details.';
      if (errMsg.toLowerCase().includes('password')) {
        lue_fieldError(pwdEl, errMsg);
      } else {
        lue_fieldError(emailEl, errMsg);
      }
    }
  } catch(err) {
    console.error('Login error:', err);
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Log In to My Account';
    showFormBanner(form, 'Error: ' + (err.message || 'Cannot connect to server'), 'error');
  }
}



function initRoleCards() {
  document.querySelectorAll('.role-card').forEach(function (card) {
    card.addEventListener('click', function () {
      selectRole(this);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectRole(this);
      }
    });
    card.setAttribute('tabindex', '0');
  });
}

function _selectRoleInternal(card) {
  // Deselect all
  document.querySelectorAll('.role-card').forEach(function (c) {
    c.classList.remove('selected');
    const radio = c.querySelector('input[type="radio"]');
    if (radio) radio.checked = false;
    c.setAttribute('aria-pressed', 'false');
  });

  // Select clicked
  card.classList.add('selected');
  const radio = card.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;
  card.setAttribute('aria-pressed', 'true');
}

// Expose for inline onclick — accepts string 'buyer'/'seller' or a DOM element
window.selectRole = function (roleValueOrCard) {
  var card;
  if (typeof roleValueOrCard === 'string') {
    card = document.getElementById('role-' + roleValueOrCard + '-card');
  } else {
    card = roleValueOrCard;
  }
  // Call the internal function directly — NOT window.selectRole (avoids infinite loop)
  if (card) _selectRoleInternal(card);
};



function initPasswordStrengthMeter() {
  const pwdInput = document.getElementById('pwd-signup');
  if (!pwdInput) return;

  // Create the meter below the password input
  const meter = document.createElement('div');
  meter.className = 'lue-pwd-strength';
  meter.innerHTML = `
    <div class="ps-bars">
      <div class="ps-bar" id="ps-bar1"></div>
      <div class="ps-bar" id="ps-bar2"></div>
      <div class="ps-bar" id="ps-bar3"></div>
    </div>
    <span class="ps-label" id="ps-label"></span>`;
  meter.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;';

  // Style the bars
  const barStyle = document.createElement('style');
  barStyle.textContent = `
    .ps-bars  { display:flex;gap:4px;flex:1; }
    .ps-bar   { height:4px;flex:1;border-radius:2px;background:#D8D9DC;transition:background .2s; }
    .ps-label { font-size:11px;font-weight:700;min-width:44px;text-align:right; }
    .ps-weak  { background:#C0392B; }
    .ps-fair  { background:#F26522; }
    .ps-strong{ background:#1A8A3C; }`;
  document.head.appendChild(barStyle);

  // Insert after the input wrapper
  const inputWrap = pwdInput.closest('.input-wrap') || pwdInput.parentNode;
  inputWrap.parentNode.insertBefore(meter, inputWrap.nextSibling);

  pwdInput.addEventListener('input', function () {
    updateStrengthMeter(this.value);
  });
}

function updateStrengthMeter(value) {
  const { score, label } = lue_passwordStrength(value);
  const bars  = [1, 2, 3].map(n => document.getElementById('ps-bar' + n));
  const lbl   = document.getElementById('ps-label');
  if (!bars[0] || !lbl) return;

  const colours = { 1: 'ps-weak', 2: 'ps-fair', 3: 'ps-strong' };
  const textCol = { 1: '#C0392B', 2: '#F26522', 3: '#1A8A3C' };

  bars.forEach(b => { b.className = 'ps-bar'; });

  if (score >= 1) bars[0].classList.add(colours[score]);
  if (score >= 2) bars[1].classList.add(colours[score]);
  if (score >= 3) bars[2].classList.add(colours[score]);

  lbl.textContent = label;
  lbl.style.color = score > 0 ? (textCol[score] || '#9A9CA2') : '#9A9CA2';
}



function initPasswordToggles() {
  document.querySelectorAll('.pwd-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      togglePwd(btn);
    });
  });
}

function togglePwd(btn) {
  const wrap  = btn.closest('.input-wrap');
  const input = wrap?.querySelector('input[type="password"], input[type="text"]');
  if (!input) return;

  const isHidden = input.type === 'password';
  input.type     = isHidden ? 'text' : 'password';

  // Swap the eye icon
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.innerHTML = isHidden
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
         <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
         <line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
         <circle cx="12" cy="12" r="3"/>`;
  }
}

// Expose for inline onclick handlers in signup.html
window.togglePwd = function (inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type     = isHidden ? 'text' : 'password';
  const svg = btn?.querySelector('svg');
  if (svg) {
    svg.innerHTML = isHidden
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
         <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
         <line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
         <circle cx="12" cy="12" r="3"/>`;
  }
};



/**
 * Show a success or error banner at the top of a form.
 * @param {HTMLElement} form
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showFormBanner(form, message, type) {
  // Remove any existing banner
  const existing = form.querySelector('.lue-form-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.className = 'lue-form-banner';
  banner.textContent = message;
  banner.style.cssText = [
    'padding:12px 16px', 'border-radius:6px',
    'font-size:13px', 'font-weight:600', 'margin-bottom:14px',
    type === 'success'
      ? 'background:#E8F5EE;color:#1A7A36;border:1px solid rgba(26,122,54,.25);'
      : 'background:#FDECEA;color:#C0392B;border:1px solid rgba(192,57,43,.25);'
  ].join(';');

  form.insertBefore(banner, form.firstChild);

  // Auto-remove error banners after 6 seconds
  if (type === 'error') {
    setTimeout(function () { banner.remove(); }, 6000);
  }
}

/* Keyboard shortcut: pressing Enter in the email field on the login
   panel automatically moves focus to the password field */
document.addEventListener('DOMContentLoaded', function () {
  const loginEmail = document.getElementById('email-login');
  if (loginEmail) {
    loginEmail.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('pwd-login')?.focus();
      }
    });
  }
});