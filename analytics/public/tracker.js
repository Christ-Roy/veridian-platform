/* Veridian Analytics — tracker.js v2
 * Snippet :
 *   <script async src="https://analytics/tracker.js" data-site-key="XXX"
 *           data-veridian-track="auto"></script>
 *
 * Design : simple, robuste, low-maintenance.
 *   1. Pageview enrichi au chargement (screen, locale, réseau, signaux bot)
 *   2. SPA navigation (pushState / popstate)
 *   3. Interaction detection : dès qu'on détecte scroll/mousemove/click/touch/keypress
 *      → 1 beacon pour marquer le pageview comme "interacted". C'est tout.
 *   4. Session-end beacon au unload (timeOnPage, scrollDepthMax)
 *   5. Form + CTA tracking
 */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  if (!SCRIPT) return;
  var SITE_KEY = SCRIPT.getAttribute('data-site-key');
  if (!SITE_KEY) return;
  var BASE = new URL(SCRIPT.src).origin;
  var DEBUG = new URLSearchParams(window.location.search).has('veridian_debug');

  function log() {
    if (DEBUG) console.log.apply(console, ['[veridian]'].concat(Array.prototype.slice.call(arguments)));
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function utmParams() {
    try {
      var p = new URLSearchParams(window.location.search);
      return {
        utmSource: p.get('utm_source'),
        utmMedium: p.get('utm_medium'),
        utmCampaign: p.get('utm_campaign'),
        utmTerm: p.get('utm_term'),
        utmContent: p.get('utm_content'),
        gclid: p.get('gclid'),
        fbclid: p.get('fbclid'),
      };
    } catch (e) { return {}; }
  }

  function sessionId() {
    try {
      var k = '_veridian_sid';
      var s = sessionStorage.getItem(k);
      if (!s) {
        s = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem(k, s);
      }
      return s;
    } catch (e) { return null; }
  }

  function post(path, body) {
    try {
      fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-site-key': SITE_KEY },
        body: JSON.stringify(body),
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
      }).then(function (r) {
        if (DEBUG && r.ok) r.json().then(function (d) { log(path, d); });
      }).catch(function () {});
    } catch (e) {}
  }

  function beacon(path, body) {
    try {
      // sendBeacon can't set headers → embed siteKey in body
      var data = JSON.parse(JSON.stringify(body));
      data._siteKey = SITE_KEY;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BASE + path, new Blob([JSON.stringify(data)], { type: 'application/json' }));
      }
      // Also try fetch as fallback
      fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-site-key': SITE_KEY },
        body: JSON.stringify(body),
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
      }).catch(function () {});
    } catch (e) {}
  }

  // ============================================================================
  // Device signals (envoyés avec chaque pageview)
  // ============================================================================

  function collectSignals() {
    var nav = navigator;
    var scr = screen || {};
    var conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    return {
      screen: { width: scr.width || 0, height: scr.height || 0, pixelRatio: window.devicePixelRatio || 1, colorDepth: scr.colorDepth || 0 },
      viewport: { width: window.innerWidth || 0, height: window.innerHeight || 0 },
      lang: nav.language || null,
      tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })(),
      tzOffset: new Date().getTimezoneOffset(),
      connection: conn ? { type: conn.type || null, effectiveType: conn.effectiveType || null, saveData: conn.saveData || false } : null,
      webdriver: nav.webdriver === true,
      plugins: nav.plugins ? nav.plugins.length : 0,
      hardwareConcurrency: nav.hardwareConcurrency || 0,
      maxTouchPoints: nav.maxTouchPoints || 0,
    };
  }

  // ============================================================================
  // Pageview
  // ============================================================================

  var pageStart = null;
  var pagePath = null;
  var scrollMax = 0;
  var interactions = 0;
  var interactionSent = false;

  function resetPage() {
    pageStart = Date.now();
    pagePath = window.location.pathname + window.location.search;
    scrollMax = 0;
    interactions = 0;
    interactionSent = false;
  }

  function trackPageview() {
    resetPage();
    var u = utmParams();
    post('/api/ingest/pageview', {
      path: pagePath,
      referrer: document.referrer || null,
      sessionId: sessionId(),
      utmSource: u.utmSource, utmMedium: u.utmMedium, utmCampaign: u.utmCampaign,
      utmTerm: u.utmTerm, utmContent: u.utmContent,
      gclid: u.gclid, fbclid: u.fbclid,
      signals: collectSignals(),
    });
    log('pageview', pagePath);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    trackPageview();
  } else {
    window.addEventListener('DOMContentLoaded', trackPageview);
  }

  // SPA
  var _push = history.pushState;
  history.pushState = function () {
    sendSessionEnd('navigate');
    _push.apply(this, arguments);
    setTimeout(trackPageview, 0);
  };
  window.addEventListener('popstate', function () {
    sendSessionEnd('back');
    trackPageview();
  });

  // ============================================================================
  // Interaction detection — simple. Dès qu'on voit un geste humain, on envoie
  // un seul beacon. Pas de forensic, pas de validation de trajectoire.
  // ============================================================================

  function markInteracted(type) {
    if (interactionSent) return;
    interactionSent = true;
    log('interacted', type);
    post('/api/ingest/interaction', {
      sessionId: sessionId(),
      type: type,
    });
  }

  // Scroll : 2+ events et 200+ px cumulés
  var scrollTotal = 0;
  var scrollEvents = 0;
  var lastScrollY = window.scrollY || 0;
  document.addEventListener('scroll', function () {
    var cur = window.scrollY || 0;
    scrollTotal += Math.abs(cur - lastScrollY);
    lastScrollY = cur;
    scrollEvents++;
    interactions++;

    // Update scroll depth
    var docH = Math.max(document.body.scrollHeight || 0, document.documentElement.scrollHeight || 0);
    var pct = docH > 0 ? Math.round(((cur + window.innerHeight) / docH) * 100) : 0;
    if (pct > scrollMax) scrollMax = Math.min(100, pct);

    if (scrollEvents >= 2 && scrollTotal >= 200) markInteracted('scroll');
  }, { passive: true });

  // Mousemove : 50+ px cumulés
  var mouseTotal = 0;
  var lastMX = null, lastMY = null;
  document.addEventListener('mousemove', function (e) {
    interactions++;
    if (lastMX !== null) {
      mouseTotal += Math.abs(e.clientX - lastMX) + Math.abs(e.clientY - lastMY);
    }
    lastMX = e.clientX;
    lastMY = e.clientY;
    if (mouseTotal >= 50) markInteracted('mousemove');
  }, { passive: true });

  // Click sur élément interactif (> 100ms après pageload)
  document.addEventListener('click', function (e) {
    interactions++;
    if (pageStart && Date.now() - pageStart > 100) {
      markInteracted('click');
    }
  }, { passive: true });

  // Touch
  var touchStartPos = null;
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    if (t) touchStartPos = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    interactions++;
    if (!touchStartPos) return;
    var t = e.touches[0];
    if (!t) return;
    var d = Math.sqrt(Math.pow(t.clientX - touchStartPos.x, 2) + Math.pow(t.clientY - touchStartPos.y, 2));
    if (d > 30) markInteracted('touch');
  }, { passive: true });

  // Keypress (skip Tab/Escape)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' || e.key === 'Escape') return;
    interactions++;
    markInteracted('keypress');
  }, { passive: true });

  // ============================================================================
  // Session-end beacon (timeOnPage, scrollDepthMax)
  // ============================================================================

  function sendSessionEnd(leftVia) {
    if (!pageStart) return;
    beacon('/api/ingest/session-end', {
      sessionId: sessionId(),
      lastPath: pagePath,
      timeOnPage: Date.now() - pageStart,
      scrollDepthMax: scrollMax,
      interactionCount: interactions,
      leftVia: leftVia || 'close',
    });
  }

  window.addEventListener('beforeunload', function () { sendSessionEnd('close'); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendSessionEnd('close');
  });

  // ============================================================================
  // Form tracking
  // ============================================================================

  var autoCapture = SCRIPT.getAttribute('data-veridian-track') === 'auto';

  function serializeForm(form) {
    var out = {};
    try {
      var fd = new FormData(form);
      fd.forEach(function (v, k) { if (typeof v === 'string') out[k] = v; });
    } catch (e) {}
    return out;
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var name = form.getAttribute('data-veridian-track') ||
      (autoCapture ? form.getAttribute('name') || window.location.pathname.replace(/^\//, '').replace(/\/$/, '') || 'accueil' : null);
    if (!name) return;
    var payload = serializeForm(form);
    var u = utmParams();
    post('/api/ingest/form', {
      formName: name, path: window.location.pathname, payload: payload,
      email: payload.email || null,
      phone: payload.phone || payload.tel || payload.telephone || null,
      utmSource: u.utmSource, sessionId: sessionId(),
    });
  }, true);

  // ============================================================================
  // CTA click tracking
  // ============================================================================

  document.addEventListener('click', function (e) {
    var el = e.target;
    var d = 5;
    while (el && d-- > 0) {
      var cta = el.getAttribute && el.getAttribute('data-veridian-cta');
      if (cta) {
        post('/api/ingest/pageview', { path: window.location.pathname, referrer: 'cta:' + cta, sessionId: sessionId(), utmSource: utmParams().utmSource });
        return;
      }
      if (el.tagName === 'A' && el.href) {
        if (el.href.indexOf('tel:') === 0) {
          post('/api/ingest/pageview', { path: window.location.pathname, referrer: 'cta:tel:' + el.href.replace('tel:', '').replace(/\s/g, ''), sessionId: sessionId(), utmSource: utmParams().utmSource });
          return;
        }
        if (el.href.indexOf('mailto:') === 0) {
          post('/api/ingest/pageview', { path: window.location.pathname, referrer: 'cta:mailto', sessionId: sessionId(), utmSource: utmParams().utmSource });
          return;
        }
      }
      el = el.parentElement;
    }
  }, true);
})();
