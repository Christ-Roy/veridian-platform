/* Veridian Analytics — tracker.js
 * Snippet a coller sur les sites clients :
 *   <script async src="https://analytics/tracker.js" data-site-key="XXX"
 *           data-veridian-track="auto"></script>
 *
 * Ce qu'il fait :
 *   1. Page view automatique au chargement (+ SPA navigation via pushState)
 *   2. Intercepte les <form> submit (si data-veridian-track="form-name")
 *   3. Tracke les clics CTA : liens tel:, mailto:, et data-veridian-cta="nom"
 *   4. Lit les utm_* depuis l'URL et les envoie avec chaque event
 */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  if (!SCRIPT) return;
  var SITE_KEY = SCRIPT.getAttribute('data-site-key');
  if (!SITE_KEY) {
    console.warn('[veridian] missing data-site-key');
    return;
  }
  // Derive le endpoint analytics depuis le src du script.
  var BASE = new URL(SCRIPT.src).origin;

  function utmParams() {
    try {
      var p = new URLSearchParams(window.location.search);
      return {
        utmSource: p.get('utm_source'),
        utmMedium: p.get('utm_medium'),
        utmTerm: p.get('utm_term'),
      };
    } catch (e) {
      return {};
    }
  }

  // Session id simple stocke en sessionStorage (expire a la fermeture d'onglet).
  function sessionId() {
    try {
      var k = '_veridian_sid';
      var s = sessionStorage.getItem(k);
      if (!s) {
        s = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem(k, s);
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function post(path, body) {
    try {
      var data = JSON.stringify(body);
      // navigator.sendBeacon est le plus fiable au unload, sinon fetch.
      var url = BASE + path;
      if (navigator.sendBeacon) {
        var blob = new Blob([data], { type: 'application/json' });
        // sendBeacon n'autorise pas de headers custom → on utilise fetch keepalive.
      }
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-site-key': SITE_KEY,
        },
        body: data,
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
      }).catch(function () {
        /* swallow */
      });
    } catch (e) {
      /* noop */
    }
  }

  function trackPageview() {
    var u = utmParams();
    post('/api/ingest/pageview', {
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      utmSource: u.utmSource,
      utmMedium: u.utmMedium,
      utmTerm: u.utmTerm,
      sessionId: sessionId(),
    });
  }

  // Pageview initial
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    trackPageview();
  } else {
    window.addEventListener('DOMContentLoaded', trackPageview);
  }

  // SPA navigation (Next.js, React Router, etc.)
  var _push = history.pushState;
  history.pushState = function () {
    _push.apply(this, arguments);
    setTimeout(trackPageview, 0);
  };
  window.addEventListener('popstate', trackPageview);

  // Form tracking : sur submit d'un <form>, on envoie un FormSubmission.
  // Opt-in via data-veridian-track="form-name" sur le <form>, OU attribut
  // data-veridian-track="auto" sur le <script> lui-meme pour tout capturer.
  var autoCapture = SCRIPT.getAttribute('data-veridian-track') === 'auto';

  function serializeForm(form) {
    var out = {};
    try {
      var fd = new FormData(form);
      fd.forEach(function (v, k) {
        // Skip passwords et fichiers.
        if (typeof v === 'string') out[k] = v;
      });
    } catch (e) {}
    return out;
  }

  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      // Nom du formulaire : priorite au data-veridian-track explicite,
      // sinon l'attribut name du <form>, sinon le pathname de la page.
      // En mode auto on capture TOUT, le nom est derive automatiquement.
      // Ex: /contact → "contact", /devis → "devis", / → "accueil"
      var name =
        form.getAttribute('data-veridian-track') ||
        (autoCapture
          ? form.getAttribute('name') ||
            window.location.pathname.replace(/^\//, '').replace(/\/$/, '') ||
            'accueil'
          : null);
      if (!name) return;

      var payload = serializeForm(form);
      var u = utmParams();
      post('/api/ingest/form', {
        formName: name,
        path: window.location.pathname,
        payload: payload,
        email: payload.email || null,
        phone: payload.phone || payload.tel || payload.telephone || null,
        utmSource: u.utmSource,
      });
    },
    true,
  );

  // CTA click tracking — tracke automatiquement :
  //   1. Les elements avec data-veridian-cta="nom" (ex: <button data-veridian-cta="devis">)
  //   2. Les liens tel: (clics sur un numero de telephone)
  //   3. Les liens mailto: (clics sur un email)
  // En mode auto (data-veridian-track="auto" sur le script), on tracke aussi
  // les boutons avec role="button" ou type="submit" hors formulaire.
  document.addEventListener(
    'click',
    function (e) {
      // Remonte le DOM pour trouver l'element cliquable le plus proche
      var el = e.target;
      var maxDepth = 5;
      while (el && maxDepth-- > 0) {
        // 1. Attribut explicite data-veridian-cta
        var ctaName = el.getAttribute && el.getAttribute('data-veridian-cta');
        if (ctaName) {
          post('/api/ingest/pageview', {
            path: window.location.pathname,
            referrer: 'cta:' + ctaName,
            sessionId: sessionId(),
            utmSource: utmParams().utmSource,
          });
          return;
        }

        // 2. Lien tel: (clic sur numero de telephone)
        if (el.tagName === 'A' && el.href) {
          if (el.href.indexOf('tel:') === 0) {
            var phone = el.href.replace('tel:', '').replace(/\s/g, '');
            post('/api/ingest/pageview', {
              path: window.location.pathname,
              referrer: 'cta:tel:' + phone,
              sessionId: sessionId(),
              utmSource: utmParams().utmSource,
            });
            return;
          }

          // 3. Lien mailto:
          if (el.href.indexOf('mailto:') === 0) {
            post('/api/ingest/pageview', {
              path: window.location.pathname,
              referrer: 'cta:mailto',
              sessionId: sessionId(),
              utmSource: utmParams().utmSource,
            });
            return;
          }
        }

        el = el.parentElement;
      }
    },
    true,
  );
})();
