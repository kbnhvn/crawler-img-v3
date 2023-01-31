# crawler

à la fin, ça va créer trois fichiers :

+ pagesCrawled.txt (toutes les pages crawlées du site)
+ classPasUsed.txt (classes pas utilisées)
+ classUsed.txt (classes utilisées)

## Todo :
Il faudra que je trouve un système pour choper le "domain" du site et qu'il tej tous les liens "sortant" : actuellement j'ai plein de conditions qui check sur dans l'url 
il n'y a pas facebook, twitter ou linkedin par ex, mais ça va devenir long à la longue.

## Pour lancer le script : 
node cssCrawler.js (dans le dossier app)

Bien sûr, vu qu'il y a un package.json, pensez à le lancer auparavant pour générer les node_modules.

## v3 :
+ Utilisation de prompt-sync pour gérer les prompt en console.
+ Via la console, le script demande l'url du site à crawler, puis le type de crawl à effectuer (css, images ou les deux).
+ Le script créé un dossier au nom de l'url du site et y stocke les fichiers (liste de classes, d'urls des pages et d'images).
