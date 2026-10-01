/* Carrousel de fonds sans répétition, fondu enchaîné (sans dépendance).
   Utilisation :
     <div class="carrousel" data-fonds="a.jpg b.jpg c.jpg" data-delai="15000">
       <div class="fond" aria-hidden="true"></div>
       <div class="fond" aria-hidden="true"></div>
       …contenu par-dessus…
     </div>
   - data-fonds : images séparées par des espaces, tirées au hasard sans jamais
     répéter deux fois la même d’affilée (préchargées).
   - data-delai : millisecondes entre deux fonds (15000 par défaut).
   - Coupé automatiquement si prefers-reduced-motion.
   Réutilisable tel quel côté frontend (même balisage, même CSS dans commun.css). */
(function () {
  'use strict';
  function tirage(n, sauf) {
    var i;
    do { i = Math.floor(Math.random() * n); } while (i === sauf);
    return i;
  }
  Array.prototype.forEach.call(document.querySelectorAll('.carrousel'), function (zone) {
    var fonds = (zone.getAttribute('data-fonds') || '').split(/\s+/).filter(Boolean);
    var couches = zone.querySelectorAll(':scope > .fond');
    if (fonds.length === 0 || couches.length < 2) { return; }
    var delai = parseInt(zone.getAttribute('data-delai') || '15000', 10);
    var courant = Math.floor(Math.random() * fonds.length);
    var visible = couches[0], cachee = couches[1];
    fonds.forEach(function (src) { var im = new Image(); im.src = src; });
    visible.style.backgroundImage = 'url("' + fonds[courant] + '")';
    visible.classList.add('visible');
    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduit) {
      setInterval(function () {
        courant = tirage(fonds.length, courant);
        cachee.style.backgroundImage = 'url("' + fonds[courant] + '")';
        cachee.classList.add('visible');
        visible.classList.remove('visible');
        var echange = visible; visible = cachee; cachee = echange;
      }, delai);
    }
  });
})();
