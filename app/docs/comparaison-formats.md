# Comparaison des formats du tuteur

## Essai contrôlé du lecteur

Le banc `tools/eval/comparer-formats-ui.mjs` envoie au navigateur les mêmes phrases et les mêmes commandes de dessin, en format historique puis segmenté. Les réponses du modèle sont simulées ; la voix est simulée à trois secondes par phrase. Ce banc vérifie le transport reçu par le navigateur et l'enchaînement de l'interface, du lecteur et de Manim. Il ne mesure ni la qualité des réponses du modèle, ni une vraie voix, ni la précision au mot. La présence d'un canvas ne prouve pas à elle seule que le dessin est correct.

Essai local du 6 novembre 2026, une exécution par combinaison dans Chrome :

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
node tools/eval/comparer-formats-ui.mjs --show
```

Le navigateur reçoit des réponses simulées ; aucun changement de configuration persistante n'est nécessaire. Définir `CHROME_PATH` si Chrome n'est pas installé à son emplacement habituel. La fenêtre `--show` est automatisée et se ferme à la fin des scénarios.

## Comparaison avec un vrai modèle

Le banc `tools/eval/comparer-formats-modele.mjs` est prêt pour deux déploiements de test dont le code, le modèle et l'effort sont identiques, le premier avec `TUTOR_STEP_FORMAT=legacy` et le second avec `TUTOR_STEP_FORMAT=segmented`. Il utilise trois questions et deux répétitions, en alternant l'ordre. Il refuse deux URLs identiques et signale si le format réellement reçu, le modèle, l'effort ou le fournisseur ne sont pas comparables.

Le diagnostic envoie un jeton aux deux URLs : utiliser uniquement des déploiements de confiance et ne jamais publier le jeton. Les appels au modèle et à la voix peuvent être facturés. Configurer les variables `LEGACY_URL`, `SEGMENTED_URL` et `SELFTEST_TOKEN` dans le terminal, puis exécuter :

```powershell
node tools/eval/comparer-formats-modele.mjs
```

Le banc collecte les délais serveur, les commandes et les erreurs ; il ne remplace pas une observation de la voix et du rendu. Les métriques de cibles absentes et de repères doivent être interprétées avec prudence pour les figures composées et les formats segmentés. Il ne modifie aucun déploiement.

Le 6 novembre, le nouveau format existe dans la copie locale mais pas dans le déploiement existant identifié. Les clés Clerk d'aperçu sont limitées à une autre branche et le jeton diagnostic n'est pas disponible localement : les prérequis ne sont donc pas encore réunis pour produire une comparaison réelle fiable. Ne pas activer le nouveau format sur la production pour réaliser cet essai.
