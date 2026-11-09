# Format segmenté du tuteur

Sur localhost, démarrez l'application avec `npm run dev`, connectez-vous et posez une question. Une seule requête lance la séance. Le modèle et la démonstration émettent exclusivement des étapes `segments`, jouées sur le même tableau avec la voix de Nesa. Les enregistrements des anciennes séances restent compatibles avec les outils d'analyse et de rejeu.

## Essai contrôlé du lecteur

Le banc `tools/eval/verifier-segments-ui.mjs` vérifie qu'une seule requête part, qu'un seul tableau est visible et que les deux phrases simulées sont lues dans l'ordre.

Mesures historiques du 6 novembre 2026, avant l'affichage côte à côte.

| Scénario | Format | Premier puis deuxième texte | Canvas | Erreur JavaScript | Délai observé entre les deux textes |
|---|---|---|---:|---|---:|
| Triangle | Historique | Visibles | 1 | Aucune | 4 470 ms |
| Triangle | Segmenté | Visibles | 1 | Aucune | 2 972 ms |
| Parabole | Historique | Visibles | 1 | Aucune | 2 752 ms |
| Parabole | Segmenté | Visibles | 1 | Aucune | 3 013 ms |

Une exécution par cas ne permet pas de conclure qu'un format est plus rapide ou meilleur. La voix étant simulée, ces valeurs servent seulement à repérer des régressions dans cet environnement.

Pour reproduire sur Windows, dans un premier PowerShell, démarrer le serveur en mode local sans appels payants :

```powershell
cd C:\Users\compt2\Desktop\nesalio-site\app
$env:DISABLE_AI = '1'
$env:NESALIO_LOCAL_DEMO = '1'
$env:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = ''
$env:CLERK_SECRET_KEY = ''
npm run dev -- -p 3000
```

Dans un second PowerShell :

```powershell
cd C:\Users\compt2\Desktop\nesalio-site\app
node tools/eval/verifier-segments-ui.mjs --show
```

Le navigateur reçoit des réponses simulées ; aucun changement de configuration persistante n'est nécessaire. Définir `CHROME_PATH` si Chrome n'est pas installé à son emplacement habituel. La fenêtre `--show` est automatisée et se ferme à la fin des scénarios.

## Banc historique de mesures serveur sur deux déploiements

Le banc `tools/eval/comparer-formats-modele.mjs` utilise deux déploiements historiques qui acceptent encore `TUTOR_STEP_FORMAT`, le premier avec `legacy` et le second avec `segmented`. Il utilise trois questions et deux répétitions, en alternant l'ordre. Il refuse deux URLs identiques et signale si le format réellement reçu, le modèle, l'effort ou le fournisseur ne sont pas comparables.

Le diagnostic envoie un jeton aux deux URLs : utiliser uniquement des déploiements de confiance et ne jamais publier le jeton. Les appels au modèle et à la voix peuvent être facturés. Configurer les variables `LEGACY_URL`, `SEGMENTED_URL` et `SELFTEST_TOKEN` dans le terminal, puis exécuter :

```powershell
node tools/eval/comparer-formats-modele.mjs
```

Le banc collecte les délais serveur, les commandes et les erreurs ; il ne remplace pas une observation de la voix et du rendu. Les métriques de cibles absentes et de repères doivent être interprétées avec prudence pour les figures composées et les formats segmentés. Il ne modifie aucun déploiement.
