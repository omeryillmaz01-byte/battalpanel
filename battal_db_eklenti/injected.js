/* Sayfa-dünyası hook — CSP nedeniyle inline enjekte edilemez, bu yüzden
   web_accessible_resources olarak dışarıdan yüklenir (chrome-extension://<id>/injected.js).
   Sayfanın kendi fetch/XHR'ını dinler; /gelir/ ve /gider/ create-update payload'larını
   window.postMessage ile içerik betiğine (content.js) geri gönderir. */
(function () {
  if (window.__zPageHook) return; window.__zPageHook = true;
  const isC = u => (/\/gelir\//.test('' + u) && !/\/gelirliste\//.test('' + u)) || (/\/gider\//.test('' + u) && !/\/giderliste\//.test('' + u));
  const emit = (req, status, res) => {
    let rq = null; try { rq = typeof req === 'string' ? JSON.parse(req) : req; } catch (e) {}
    let rs = null; try { rs = typeof res === 'string' ? JSON.parse(res) : res; } catch (e) {}
    window.postMessage({ __zcapReal: 1, req: rq, status: status, res: rs }, '*');
  };
  // fetch hook
  const of = window.fetch;
  window.fetch = function (u, o) {
    const url = (u && u.url) || u || ''; const body = o && o.body;
    const p = of.apply(this, arguments);
    if (isC(url)) { p.then(r => { r.clone().text().then(t => emit(body, r.status, t)).catch(() => {}); }).catch(() => {}); }
    return p;
  };
  // XMLHttpRequest hook (Defter Beyan bunu kullanıyor)
  const oOpen = XMLHttpRequest.prototype.open, oSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__zurl = u; return oOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    if (isC(this.__zurl)) { this.addEventListener('load', function () { emit(b, this.status, this.responseText); }); }
    return oSend.apply(this, arguments);
  };
})();
