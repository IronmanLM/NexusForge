#!/usr/bin/env python3
"""Convertit les .md de pilotage du maquetage en pages HTML du site statique.

Usage (depuis maquetage/) :  python3 outils/md-vers-html.py
Lit : README.md, CHANGELOG.md, ROADMAP.md, TODO.md
Écrit : html/README.html, html/CHANGELOG.html, html/ROADMAP.html, html/TODO.html
Ne pas retoucher les .html générés à la main : ils portent un bandeau l'indiquant.
"""
import html
import io
import os
import re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GABARIT = """<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{titre} — Maquetage NexusForge</title>
<link rel="stylesheet" href="../css/preview.css">
<!-- Page générée par outils/md-vers-html.py — retoucher le .md, pas ce fichier. -->
</head>
<body>
  <main class="doc">
    <p class="sur-titre"><a href="../index.html">← Maquetage</a></p>
{corps}
  </main>
</body>
</html>
"""


def en_ligne(texte):
    texte = html.escape(texte)
    texte = re.sub(r"`([^`]+)`", r"<code>\1</code>", texte)
    texte = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", texte)
    texte = re.sub(r'\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)',
                   r'<a href="\3"><img class="bouclier" alt="\1" src="\2"></a>', texte)
    texte = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r'<img alt="\1" src="\2">', texte)
    texte = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', texte)
    texte = re.sub(r'href="([A-Za-z0-9_-]+)\.md"', r'href="\1.html"', texte)
    return texte


def convertir(lignes):
    blocs, paragraphe, puces, pre = [], [], [], False
    tampon_pre = []

    def vider_paragraphe():
        if paragraphe:
            blocs.append("<p>%s</p>" % " ".join(paragraphe))
            paragraphe.clear()

    def vider_puces():
        if puces:
            blocs.append("<ul>\n%s\n</ul>" % "\n".join(puces))
            puces.clear()

    for ligne in lignes:
        brute = ligne.rstrip("\n")
        if brute.startswith("```"):
            if pre:
                blocs.append("<pre><code>%s</code></pre>" % html.escape("\n".join(tampon_pre)))
                tampon_pre.clear()
                pre = False
            else:
                vider_paragraphe()
                vider_puces()
                pre = True
            continue
        if pre:
            tampon_pre.append(brute)
            continue
        depouillee = brute.strip()
        if not depouillee:
            vider_paragraphe()
            vider_puces()
            continue
        if depouillee.startswith("### "):
            vider_paragraphe()
            vider_puces()
            blocs.append("<h3>%s</h3>" % en_ligne(depouillee[4:]))
        elif depouillee.startswith("## "):
            vider_paragraphe()
            vider_puces()
            blocs.append("<h2>%s</h2>" % en_ligne(depouillee[3:]))
        elif depouillee.startswith("# "):
            vider_paragraphe()
            vider_puces()
            blocs.append("<h1>%s</h1>" % en_ligne(depouillee[2:]))
        elif depouillee.startswith("- [ ] "):
            vider_paragraphe()
            puces.append('<li class="case"><span aria-hidden="true">☐</span> %s</li>'
                         % en_ligne(depouillee[6:]))
        elif depouillee.startswith("- [x] "):
            vider_paragraphe()
            puces.append('<li class="case faite"><span aria-hidden="true">☑</span> %s</li>'
                         % en_ligne(depouillee[6:]))
        elif depouillee.startswith("- "):
            vider_paragraphe()
            puces.append("<li>%s</li>" % en_ligne(depouillee[2:]))
        else:
            vider_puces()
            paragraphe.append(en_ligne(depouillee))
    vider_paragraphe()
    vider_puces()
    return "\n".join(blocs)


def main():
    for nom in ("README", "CHANGELOG", "ROADMAP", "TODO"):
        with io.open(os.path.join(RACINE, nom + ".md"), encoding="utf-8") as f:
            lignes = f.read().splitlines()
        titre = "Document"
        for ligne in lignes:
            if ligne.startswith("# "):
                titre = ligne[2:].strip()
                break
        corps = convertir(lignes)
        page = GABARIT.format(titre=titre, corps=corps)
        cible = os.path.join(RACINE, "html", nom + ".html")
        with io.open(cible, "w", encoding="utf-8") as f:
            f.write(page)
        print(nom + ".html OK")


if __name__ == "__main__":
    main()
