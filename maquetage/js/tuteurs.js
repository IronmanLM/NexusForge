/* Espace parents : validation de l’autorisation (simulation, sans backend).
   Exige : pseudo renseigné + 3 documents lus et validés (via la modale
   de wizard.js) + case d’autorisation cochée. */
(function () {
  'use strict';
  var bouton = document.getElementById('valider-autorisation');
  if (!bouton) { return; }
  function dire(texte, ok) {
    var zone = document.getElementById('message-tuteurs');
    if (!zone) { return; }
    zone.hidden = false;
    zone.textContent = texte;
    zone.className = 'message-tuteurs ' + (ok ? 'succes' : 'erreur');
  }
  bouton.addEventListener('click', function () {
    var pseudo = document.getElementById('pseudo-enfant');
    if (!pseudo || !pseudo.value.trim()) {
      dire('Indiquez le pseudo de l’enfant inscrit.', false);
      return;
    }
    var docs = ['coche-t-cgu', 'coche-t-conf', 'coche-t-mineurs'];
    for (var i = 0; i < docs.length; i++) {
      var c = document.getElementById(docs[i]);
      if (!c || !c.checked) {
        dire('Lisez puis validez les trois documents ci-dessus avant d’autoriser.', false);
        return;
      }
    }
    var accord = document.getElementById('coche-t-autorise');
    if (!accord || !accord.checked) {
      dire('Cochez votre autorisation en tant que représentant légal.', false);
      return;
    }
    dire('✓ Autorisation enregistrée pour « ' + pseudo.value.trim() + ' » (simulation). Le compte sera activé après validation par un administrateur.', true);
  });
})();
