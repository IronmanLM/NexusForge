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
    zone.addEventListener('click', function (e) {
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
  montrer(0);
})();
