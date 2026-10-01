/* Assistant pas-à-pas (sans dépendance).
   Conventions (même balisage reprisable côté frontend) :
     [data-wizard]                  conteneur
     [data-panneau="nom"]           étapes (la première visible, les autres hidden)
     [data-suivant] / [data-precedent] boutons de navigation
     li[data-etape="nom"]           progression (classes .fait, aria-current)
     #naissance                     date de naissance -> body[data-mineur]
     window.NF_WIZARD_VOIES         { joueur: 'id-case', conteur: 'id-case' }
     [data-si-mineur] / [data-si-conteur] / [data-si-joueur-seul] blocs conditionnels
     [data-requis-mineur] / [data-requis-conteur] cases requises quand visibles
   #courriel-parent                doit differer du courriel du compte (si mineur)
   [data-lire]                    bouton d’ouverture (data-doc, data-titre, data-case)
   #modale-doc                    modale : iframe + #modale-lu + #modale-accepter ;
                                  la case data-case reste desactivee tant que le
                                  document n’est pas lu ET valide explicitement
   Validation : champs [required] visibles du panneau courant + au moins une voie. */
(function () {
  'use strict';
  var zone = document.querySelector('[data-wizard]');
  if (!zone) { return; }
  var panneaux = Array.prototype.slice.call(zone.querySelectorAll('[data-panneau]'));
  var puces = Array.prototype.slice.call(zone.querySelectorAll('[data-etape]'));
  var courant = 0;
  var VOIES = window.NF_WIZARD_VOIES || {};
  var CODE_DEMO = '428137'; /* OTP courriel (simulation, sans backend) */
  var SECRET_TOTP = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; /* clé démo affichée + QR (RFC 6238) */
  function sha1(msg) {
    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    var bytes = msg.slice();
    var ml = bytes.length;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) { bytes.push(0); }
    var hi = Math.floor(ml / 0x20000000), lo = (ml << 3) >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
               (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var w80 = new Array(80);
    var rol = function (n, s) { return ((n << s) | (n >>> (32 - s))) >>> 0; };
    for (var b = 0; b < bytes.length; b += 64) {
      var i;
      for (i = 0; i < 16; i++) {
        w80[i] = ((bytes[b + i * 4] << 24) | (bytes[b + i * 4 + 1] << 16) | (bytes[b + i * 4 + 2] << 8) | bytes[b + i * 4 + 3]) >>> 0;
      }
      for (i = 16; i < 80; i++) { w80[i] = rol(w80[i - 3] ^ w80[i - 8] ^ w80[i - 14] ^ w80[i - 16], 1); }
      var a = h0, bb = h1, cc = h2, dd = h3, ee = h4, f, k;
      for (i = 0; i < 80; i++) {
        if (i < 20) { f = (bb & dd) | (~bb & ee); k = 0x5A827999; }
        else if (i < 40) { f = bb ^ dd ^ ee; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (bb & dd) | (bb & ee) | (dd & ee); k = 0x8F1BBCDC; }
        else { f = bb ^ dd ^ ee; k = 0xCA62C1D6; }
        var tmp = (rol(a, 5) + f + ee + k + w80[i]) >>> 0;
        ee = dd; dd = cc; cc = rol(bb, 30); bb = a; a = tmp;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + cc) >>> 0; h3 = (h3 + dd) >>> 0; h4 = (h4 + ee) >>> 0;
    }
    var out = [];
    [h0, h1, h2, h3, h4].forEach(function (h) { out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255); });
    return out;
  }
  function hmacSha1(cle, msg) {
    if (cle.length > 64) { cle = sha1(cle); }
    while (cle.length < 64) { cle.push(0); }
    var o = [], ip = [];
    for (var i = 0; i < 64; i++) { o.push(cle[i] ^ 0x5c); ip.push(cle[i] ^ 0x36); }
    return sha1(o.concat(sha1(ip.concat(msg))));
  }
  function base32(texte) {
    var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    var s = String(texte).toUpperCase().replace(/[^A-Z2-7]/g, '');
    var val = 0, bits = 0, out = [];
    for (var i = 0; i < s.length; i++) {
      val = (val << 5) | alpha.indexOf(s.charAt(i));
      bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return out;
  }
  function totpGenere(secret, t) {
    var cle = base32(secret);
    var compteur = Math.floor(t / 30);
    var hi = Math.floor(compteur / 4294967296), lo = compteur % 4294967296;
    var msg = [(hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
               (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255];
    var h = hmacSha1(cle, msg);
    var off = h[19] & 15;
    var code = (((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1000000;
    return ('000000' + code).slice(-6);
  }
  function totpValide(secret, saisie) {
    var t = Math.floor(Date.now() / 1000);
    for (var d = -1; d <= 1; d++) {
      if (totpGenere(secret, t + d * 30) === saisie) { return true; }
    }
    return false;
  }
  window.NF_TOTP = { secret: SECRET_TOTP, generer: totpGenere, verifier: totpValide };
  var naissance = document.getElementById('naissance');

  function estMajeur() {
    if (!naissance || !naissance.value) { return true; }
    var date = new Date(naissance.value + 'T00:00:00');
    if (isNaN(date.getTime())) { return true; }
    var limite = new Date(date.getFullYear() + 18, date.getMonth(), date.getDate());
    return new Date() >= limite;
  }
  function estConteur() {
    var id = VOIES.conteur;
    var el = id && document.getElementById(id);
    return !!(el && el.checked);
  }
  function voiesChoisies() {
    return Object.keys(VOIES).some(function (k) {
      var el = document.getElementById(VOIES[k]);
      return el && el.checked;
    });
  }
  function rafraichirConditions() {
    var mineur = !estMajeur();
    document.body.setAttribute('data-mineur', mineur ? 'oui' : 'non');
    var noteAge = document.getElementById('note-age');
    var rappelAge = document.getElementById('rappel-age');
    var texteAge = '';
    if (naissance && naissance.value) {
      texteAge = mineur ? 'Détecté : mineur — accord parental requis.'
                        : 'Détecté : majeur — accords standards.';
    }
    if (noteAge) { noteAge.textContent = (!naissance || !naissance.value) ? '' : texteAge; }
    if (rappelAge) { rappelAge.textContent = texteAge || 'Âge non renseigné : retourne à l’étape Compte.'; }
    var conteur = estConteur();
    Array.prototype.forEach.call(document.querySelectorAll('[data-si-mineur]'), function (el) {
      el.hidden = !mineur;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-requis-mineur]'), function (el) {
      el.required = mineur;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-si-conteur]'), function (el) {
      el.hidden = !conteur;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-requis-conteur]'), function (el) {
      el.required = conteur;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-si-joueur-seul]'), function (el) {
      el.hidden = conteur;
    });
    /* « Me rappeler plus tard » (joueur uniquement) : le code TOTP disparaît avec son obligation */
    var reporte = document.getElementById('totp-plus-tard');
    var reporteCoche = !!(reporte && reporte.checked);
    var blocCode = document.getElementById('bloc-code');
    if (blocCode) { blocCode.hidden = reporteCoche; }
    var blocConfig = document.getElementById('bloc-config-totp');
    if (blocConfig) { blocConfig.hidden = reporteCoche; }
    var codeTotp = document.getElementById('code-totp');
    if (codeTotp) { codeTotp.required = !reporteCoche; }
  }
  function message(panneau, texte) {
    var el = panneau.querySelector('.avert-champ');
    if (!el) {
      el = document.createElement('p');
      el.className = 'avert-champ';
      el.setAttribute('role', 'alert');
      panneau.appendChild(el);
    }
    el.textContent = texte || '';
    el.hidden = !texte;
  }
  function valide(i) {
    var panneau = panneaux[i];
    message(panneau, '');
    if (panneau.getAttribute('data-panneau') === 'chemin') {
      if (!voiesChoisies()) {
        message(panneau, 'Choisis au moins une voie : joueur, conteur… ou les deux.');
        return false;
      }
      return true;
    }
    if (panneau.getAttribute('data-panneau') === 'accords' && !estMajeur()) {
      var mien = document.querySelector('[data-panneau="compte"] [name="courriel"]');
      var parent = document.getElementById('courriel-parent');
      if (parent) { parent.setCustomValidity(''); }
      if (mien && parent && parent.value &&
          mien.value.trim().toLowerCase() === parent.value.trim().toLowerCase()) {
        parent.setCustomValidity('Doit être différent de ton adresse d’inscription.');
        parent.reportValidity();
        return false;
      }
    }
    if (panneau.getAttribute('data-panneau') === 'verification') {
      var mail2 = document.getElementById('code-email');
      if (mail2 && (mail2.value || '').replace(/[\s-]/g, '') !== CODE_DEMO) {
        message(panneau, 'Code courriel incorrect (simulation : ' + CODE_DEMO + ').');
        return false;
      }
      var reporte2 = document.getElementById('totp-plus-tard');
      var code2 = document.getElementById('code-totp');
      if (code2 && !(reporte2 && reporte2.checked)) {
        var saisie = (code2.value || '').replace(/[\s-]/g, '');
        if (!totpValide(SECRET_TOTP, saisie)) {
          message(panneau, 'Code TOTP incorrect ou expiré — vérifie ton application (période de 30 secondes).');
          return false;
        }
      }
    }
    var champs = Array.prototype.slice.call(panneau.querySelectorAll('[required]'));
    for (var j = 0; j < champs.length; j++) {
      if (champs[j].offsetParent === null) { continue; }
      if (!champs[j].checkValidity()) {
        champs[j].reportValidity();
        return false;
      }
    }
    return true;
  }
  function montrer(i) {
    courant = Math.max(0, Math.min(panneaux.length - 1, i));
    panneaux.forEach(function (p, k) { p.hidden = k !== courant; });
    var nom = panneaux[courant].getAttribute('data-panneau');
    var vu = false;
    puces.forEach(function (li) {
      var ici = li.getAttribute('data-etape') === nom;
      if (ici) { vu = true; }
      li.classList.toggle('fait', !ici && !vu);
      if (ici) { li.setAttribute('aria-current', 'step'); }
      else { li.removeAttribute('aria-current'); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-eclairage]'), function (el) {
      el.hidden = el.getAttribute('data-eclairage') !== nom;
    });
    rafraichirConditions();
  }
  zone.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-suivant], [data-precedent]');
    if (!btn) { return; }
    if (btn.hasAttribute('data-suivant')) {
      if (valide(courant)) { montrer(courant + 1); }
    } else {
      montrer(courant - 1);
    }
  });
  Object.keys(VOIES).forEach(function (k) {
    var el = document.getElementById(VOIES[k]);
    if (el) { el.addEventListener('change', rafraichirConditions); }
  });
  if (naissance) { naissance.addEventListener('change', rafraichirConditions); }
  var totpPlusTard = document.getElementById('totp-plus-tard');
  if (totpPlusTard) { totpPlusTard.addEventListener('change', rafraichirConditions); }
  var envoyerCode = document.getElementById('envoyer-code');
  if (envoyerCode) { envoyerCode.addEventListener('click', function () {
    var note = document.getElementById('note-envoi');
    var mien = document.querySelector('[data-panneau="compte"] [name="courriel"]');
    var dest = (mien && mien.value) ? mien.value : 'ton courriel';
    if (note) {
      note.hidden = false;
      note.textContent = 'Code envoyé à ' + dest + ' (simulation : ' + CODE_DEMO + ').';
    }
    envoyerCode.textContent = 'Renvoyer le code';
  }); }
  montrer(0);
})();

/* ——— modale documentaire : autonome, réutilisable sur toute page ——— */
(function () {
  'use strict';
  /* ——— modale documentaire : lire + valider explicitement avant de cocher ——— */
  var modale = document.getElementById('modale-doc');
  var modaleTitre = document.getElementById('modale-titre');
  var modaleIframe = document.getElementById('modale-iframe');
  var modaleLu = document.getElementById('modale-lu');
  var modaleAccepter = document.getElementById('modale-accepter');
  var docEnCours = null;
  function fermerModale() {
    if (!modale) { return; }
    modale.hidden = true;
    if (modaleIframe) { modaleIframe.setAttribute('src', 'about:blank'); }
    docEnCours = null;
  }
  if (modale) {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lire]');
      if (!btn) { return; }
      docEnCours = btn;
      if (modaleTitre) { modaleTitre.textContent = btn.getAttribute('data-titre') || 'Document'; }
      if (modaleIframe) { modaleIframe.setAttribute('src', btn.getAttribute('data-doc') || 'about:blank'); }
      if (modaleLu) { modaleLu.checked = false; }
      if (modaleAccepter) { modaleAccepter.disabled = true; }
      modale.hidden = false;
    });
    if (modaleLu) {
      modaleLu.addEventListener('change', function () {
        if (modaleAccepter) { modaleAccepter.disabled = !modaleLu.checked; }
      });
    }
    if (modaleAccepter) {
      modaleAccepter.addEventListener('click', function () {
        if (!docEnCours || !modaleLu || !modaleLu.checked) { return; }
        var cible = document.getElementById(docEnCours.getAttribute('data-case'));
        if (cible) {
          cible.disabled = false;
          cible.checked = true;
        }
        docEnCours.textContent = '✓ ' + (docEnCours.getAttribute('data-titre') || 'Document') + ' — relire';
        fermerModale();
      });
    }
    Array.prototype.forEach.call(modale.querySelectorAll('[data-fermer]'), function (btn) {
      btn.addEventListener('click', fermerModale);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modale.hidden) { fermerModale(); }
    });
  }
})();
