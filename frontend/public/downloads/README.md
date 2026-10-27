# APK Android

L'APK de distribution n'est **pas** versionne ici : embarque dans `public/`, il serait copie
dans le bundle web puis dans l'application elle-meme (environ 80 Mo de poids mort).

- telechargement public : `https://nexusforge.en-ligne.fr/downloads/nexusforge-android.apk`
- preproduction : `https://preprod.nexusforge.en-ligne.fr/downloads/nexusforge-android.apk`
- distribution principale : Play Console (`fr.enligne.nexusforge`)

Le fichier est depose directement dans le dossier `downloads/` de chaque environnement lors
de la publication d'une version, apres signature avec le keystore release.
