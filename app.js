// Static config. The events API (below) overrides paybox links and soldOut on load.
// apiBase: '' = same origin.
// paybox.*: PayBox link per event, or '' while registration is not open.
// soldOut.*: true = full. The CTA becomes a waitlist button.
// whatsapp: international digits without "+", e.g. '9725XXXXXXXX'. Empty hides WhatsApp links.
const config = {
  apiBase: '/cupping',
  whatsapp: '',
  paybox: { fermentation: "https://links.payboxapp.com/Umd6i7ImB7b", standout: "https://links.payboxapp.com/5iiMMgQmB7b" },
  soldOut: { fermentation: false, standout: false },
};

const EVENT_KEYS = ['fermentation', 'standout'];

const EVENT_NAMES = {
  fermentation: 'סבב 1 · The Fermentation Project',
  standout: 'סבב 2 · Standout Coffee',
  both: 'שני הסבבים',
};

// Filled from /api/events. Only spots_left is kept here; the rest comes from config.
const live = { spots: {} };

const $ = (sel, root = document) => root.querySelector(sel);

function isDesktop() {
  return window.matchMedia('(pointer:fine)').matches && window.innerWidth >= 900;
}

function safeHttpsUrl(value) {
  return typeof value === 'string' && /^https:\/\/\S+$/.test(value) ? value : '';
}

function waHref(text) {
  if (!config.whatsapp) return null;
  const base = 'https://wa.me/' + config.whatsapp;
  return text ? base + '?text=' + encodeURIComponent(text) : base;
}

function ctaState(key) {
  if (config.soldOut[key]) return 'waitlist';
  if (config.paybox[key]) return 'pay';
  return 'soon';
}

function buildCta(key) {
  const state = ctaState(key);
  let el;
  if (state === 'pay') {
    el = document.createElement('a');
    el.className = 'btn';
    el.href = config.paybox[key];
    el.dataset.paybox = key;
    el.textContent = 'להרשמה ותשלום';
  } else {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'btn';
    if (state === 'waitlist') {
      el.dataset.waitlist = key;
      el.textContent = 'לרשימת המתנה';
    } else {
      el.disabled = true;
      el.textContent = 'ההרשמה נפתחת בקרוב';
    }
  }
  return el;
}

// Every event can have several CTA slots on the page (timetable + its section).
function renderCta(key) {
  document.querySelectorAll(`[data-status="${key}"]`).forEach((s) => {
    s.hidden = !config.soldOut[key];
  });
  document.querySelectorAll(`[data-cta="${key}"]`).forEach((slot) => {
    slot.replaceChildren(buildCta(key));
  });
}

function renderSpots(key) {
  const n = live.spots[key];
  const show = !config.soldOut[key] && Number.isInteger(n) && n > 0 && n <= 3;
  const text = !show ? '' : n === 1 ? 'נשאר מקום אחד' : `נשארו ${n} מקומות`;
  document.querySelectorAll(`[data-spots="${key}"]`).forEach((el) => {
    el.hidden = !show;
    el.textContent = text;
  });
}

function applyConfig() {
  EVENT_KEYS.forEach((key) => {
    renderCta(key);
    renderSpots(key);
  });

  const anyClosed = EVENT_KEYS.some((key) => config.soldOut[key] || !config.paybox[key]);
  $('#waitlist').classList.toggle('is-prominent', anyClosed);

  const footWa = $('#wa-footer');
  const footHref = waHref('');
  footWa.hidden = !footHref;
  if (footHref) footWa.href = footHref;
}

// Events API: overrides paybox links, soldOut and spots. Any failure keeps the static config.
async function loadEvents() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${config.apiBase}/api/events`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return;
    const list = await res.json();
    if (!Array.isArray(list)) return;

    list.forEach((ev) => {
      if (!ev || !EVENT_KEYS.includes(ev.slug)) return;
      const key = ev.slug;
      if ('paybox_url' in ev) config.paybox[key] = safeHttpsUrl(ev.paybox_url);
      if ('sold_out' in ev) config.soldOut[key] = ev.sold_out === true || ev.spots_left === 0;
      live.spots[key] = typeof ev.spots_left === 'number' ? ev.spots_left : null;
    });

    applyConfig();
  } catch (_) {
    // Silent by design: the static config stays in effect.
  } finally {
    clearTimeout(timer);
  }
}

// QR modal

const modal = $('#qr-modal');
const modalPanel = $('.modal-panel', modal);
let lastFocus = null;

function openQr(key) {
  const url = config.paybox[key];
  if (!url) return;

  const target = $('#qr-target');
  if (typeof qrcode === 'function') {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    target.innerHTML = qr.createSvgTag(6, 2, 'קוד QR לתשלום בפייבוקס');
  } else {
    target.textContent = 'הקוד לא נטען. נסו מהנייד.';
  }

  $('#qr-title').textContent = EVENT_NAMES[key] || 'להרשמה ותשלום';
  lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  $('#qr-close').focus();
  document.addEventListener('keydown', onModalKey);
}

function closeQr() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onModalKey);
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}

function onModalKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeQr();
    return;
  }
  if (e.key !== 'Tab') return;

  const items = [...modalPanel.querySelectorAll('button:not([disabled]), a[href]')];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const inside = modalPanel.contains(document.activeElement);

  if (e.shiftKey && (!inside || document.activeElement === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
    e.preventDefault();
    first.focus();
  }
}

modal.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeQr();
});

// Waitlist

const form = $('#waitlist-form');
const errorBox = $('#form-error');
const errorText = $('#form-error-text');
const errorWa = $('#form-wa');
const doneBox = $('#form-done');
const submitBtn = $('#submit-btn');

function openWaitlist(key) {
  const radio = form.querySelector(`input[name="event"][value="${key}"]`);
  if (radio) radio.checked = true;
  $('#waitlist').scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
  $('#f-name').focus({ preventScroll: true });
}

function showError(message, focusEl) {
  errorText.textContent = message;
  errorWa.hidden = true;
  errorBox.hidden = false;
  if (focusEl) {
    focusEl.setAttribute('aria-invalid', 'true');
    focusEl.focus();
  }
}

function clearErrors() {
  errorBox.hidden = true;
  errorWa.hidden = true;
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

function showDone() {
  form.hidden = true;
  doneBox.hidden = false;
  doneBox.focus();
}

function showSendFailure(name, phone, event) {
  errorText.textContent = 'משהו לא הסתדר. נסו שוב עוד רגע.';
  const msg =
    `היי דרור, השארתי פרטים לרשימת ההמתנה לקאפינג ב-7.11: ` +
    `${EVENT_NAMES[event] || event}. שמי ${name}, הטלפון ${phone}.`;
  const href = waHref(msg);
  if (href) {
    errorWa.href = href;
    errorWa.hidden = false;
  }
  errorBox.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const phone = String(data.get('phone') || '').trim();
  const event = String(data.get('event') || '');
  const note = String(data.get('note') || '').trim();
  const website = String(data.get('website') || '');

  // Honeypot: a bot filled the hidden field. Show success without sending anything.
  if (website) {
    showDone();
    return;
  }

  if (!name) {
    showError('נשמח לדעת איך קוראים לכם.', $('#f-name'));
    return;
  }
  const digits = phone.replace(/\D/g, '');
  if (!/^[+\d\s\-()]+$/.test(phone) || digits.length < 9 || digits.length > 15) {
    showError('נדרש מספר טלפון שאפשר לחזור אליו.', $('#f-phone'));
    return;
  }
  if (!event) {
    showError('בחרו סבב, או את שניהם.', form.querySelector('input[name="event"]'));
    return;
  }

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = 'שולחים...';

  try {
    const res = await fetch(`${config.apiBase}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, phone, event, note, website: '' }),
    });
    if (res.status >= 400 && res.status < 500) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (_) {}
      showError(msg || 'משהו בפרטים לא נראה תקין. בדקו ונסו שוב.');
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    showDone();
  } catch (_) {
    showSendFailure(name, phone, event);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

// Delegated clicks: PayBox links (desktop shows QR) and waitlist buttons.

document.addEventListener('click', (e) => {
  const pay = e.target.closest('a[data-paybox]');
  if (pay) {
    if (isDesktop()) {
      e.preventDefault();
      openQr(pay.dataset.paybox);
    }
    return;
  }

  const wl = e.target.closest('button[data-waitlist]');
  if (wl) openWaitlist(wl.dataset.waitlist);
});

// Init: render the static config right away, then refresh from the API.
applyConfig();
loadEvents();
