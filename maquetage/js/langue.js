/* Mémoire et application de la langue sur <select id="langue"> (sans dépendance).
   - Mémorise le choix en localStorage (clé « nf-langue »).
   - Si la page expose window.NF_TEXTES = { fr: {...}, en: {...}, … }, applique le
     dictionnaire aux éléments [data-i18n] (contenu HTML, fonds traduits côté données).
   - Sinon, se contente de mémoriser (aucun texte en dur ici).
   Réutilisable tel quel côté frontend jusqu’au branchement du vrai système i18n. */
(function () {
  'use strict';
  var CLE = 'nf-langue';
  var select = document.getElementById('langue');
  if (!select) { return; }
  function dictionnaire(langue) {
    var tables = window.NF_TEXTES || {};
    return tables[langue] || tables.fr || {};
  }
  function appliquer(langue) {
    var dict = dictionnaire(langue);
    if (Object.keys(dict).length === 0) { langue = document.documentElement.lang || 'fr'; }
    document.documentElement.lang = langue;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      var v = dict[el.getAttribute('data-i18n')];
      if (typeof v === 'string') { el.innerHTML = v; }
    });
    try { localStorage.setItem(CLE, langue); } catch (e) {}
  }
  var initiale = 'fr';
  try { initiale = localStorage.getItem(CLE) || 'fr'; } catch (e) {}
  if (Object.keys(dictionnaire(initiale)).length === 0) { initiale = 'fr'; }
  select.value = initiale;
  appliquer(initiale);
  select.addEventListener('change', function () { appliquer(select.value); });
})();
