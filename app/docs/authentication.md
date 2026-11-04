# Comptes Nesalio — activation et sécurité

Cette intégration utilise le SDK officiel Clerk 7.9.24. Les comptes et leurs
courriels sont gérés par Clerk. L'application ne fabrique pas les codes, ne
stocke pas de mots de passe et ne reçoit pas les clés secrètes dans le navigateur.
Le site vitrine reste public. Le tuteur et ses API exigent un compte connecté.

## Activation

1. Créer le compte administrateur Clerk et l'application « Nesalio » dans le
   compte de l'utilisateur. Garder un administrateur propriétaire identifié.
2. Activer uniquement le courriel comme identifiant : courriel obligatoire,
   vérification à l'inscription et code courriel à la connexion. Désactiver
   mots de passe, téléphone et connexions sociales pour les élèves. Ne pas
   rendre le nom, la date de naissance ou l'établissement obligatoires.
3. Utiliser une instance de développement pour le local et les previews,
   une instance de production pour les vrais comptes. Les données ne doivent
   pas être partagées entre ces deux instances.
4. Définir le domaine de production `app.nesalio.com` dans Clerk et appliquer
   ses enregistrements DNS de validation. Configurer l'envoi de courriels
   de production et les protections anti-abus proposées par le service.
5. Ajouter `CLERK_SECRET_KEY` (secret serveur) et
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (clé publique) à **nesalio-app** sur Vercel.
   Utiliser les clés de l'instance correspondante pour chaque environnement.
   Ne jamais placer une clé secrète dans un fichier suivi par Git, une URL,
   une capture ou un message de chat. Utiliser le tableau Vercel ou son
   mécanisme d'entrée masquée.
6. Garder `NEXT_PUBLIC_APP_URL=https://app.nesalio.com`. Les origines acceptées
   sont cette adresse et les adresses de déploiement déclarées par Vercel,
   sans joker. Les URL Clerk sont `/connexion` et `/inscription`.
7. **Recompiler** après ajout/changement de la clé publique : les variables
   `NEXT_PUBLIC_*` sont intégrées au client pendant le build.
8. Mettre à jour la politique de confidentialité avant l'ouverture des comptes :
   fournisseur d'authentification, courriel, cookies de session, conservation,
   gestion/suppression des comptes et traitement des conversations. Ne pas
   présenter un transcript comme anonyme : un élève peut y écrire son nom.

## Contrôles mis en place

- Vérification de session côté serveur sur la page du tuteur et **chaque**
  opération `/api/tutor`, `/api/voice`, `/api/transcribe`, `/api/feedback`,
  `/api/apres-essai`, avant lecture du corps et avant appel payant.
- Seuls les jetons de session sont acceptés ; aucune identité transmise dans
  les données ou en-têtes du navigateur n'est utilisée comme preuve de connexion.
- Rejet des origines non autorisées et des requêtes signalées `cross-site`.
- Refus sans configuration ou en cas d'erreur du fournisseur (503) ; une session
  absente donne 401. Le tuteur garde son protocole d'erreurs NDJSON.
- Limites locales rattachées à l'identité vérifiée : changer l'identifiant
  de navigation ne remet plus le quota du compte à zéro.
- Réponses de refus non mises en cache. Redirection après connexion imposée
  vers `/`. Déconnexion accessible dans le menu de compte.
- Les secrets d'administration passent uniquement dans `Authorization: Bearer …`.
  Les anciens liens `?check=…` n'accordent plus d'accès ; mettre à jour les
  scripts externes éventuels. Les scripts versionnés ont été adaptés.
- Protection contre l'intégration en iframe et restriction des objets embarqués
  et de la base URL. Cette politique CSP ne restreint pas encore tous les scripts.

## Vérifications avant mise en production

- Inscription d'un véritable compte de test, réception et validation d'un code.
- Rejet d'un code incorrect, expiré ou réutilisé ; protection des renvois répétés.
- Connexion, déconnexion, session expirée puis reconnexion.
- Requêtes API anonymes ou expirées refusées sans appel aux fournisseurs payants.
- Une séance réelle, micro, voix, tableau et reprise après interruption, connecté.
- Un compte de test distinct pour vérifier les permissions si un historique est ajouté.
- Pas d'ouverture d'accès aux séances par l'identifiant de navigation ou le paramètre `ref`.
- Politique de confidentialité à jour et séparation des environnements vérifiée.

Les tests locaux couvrent les refus, la configuration absente, les origines,
les identités forgées et les cinq opérations protégées. Le parcours complet
par courriel doit être testé avec une instance Clerk réellement configurée.

## Limites qui restent à traiter

Le limiteur d'usage est encore **en mémoire par instance serveur**. Avant une
ouverture large, utiliser un compteur partagé avec quota par compte et plafond
global de dépense, plus une limite de concurrence. Un compte ne suffit pas
à empêcher les abus ou la création de comptes multiples.

Cette première intégration ne crée pas d'historique personnel ni de lien
parent-enfant. Avant d'exposer ces données, lier chaque enregistrement à un
propriétaire vérifié côté serveur et contrôler l'accès à chaque lecture,
modification, export et suppression.

Définir une durée de conservation adaptée, vérifier les sauvegardes et tester
une restauration. Ajouter des alertes sur les pannes de connexion, de voix,
de transcription et de génération, ainsi que sur les dépenses et les rejets.

## Démonstration locale sans service externe

Pour travailler sur le tableau uniquement : `NESALIO_LOCAL_DEMO=1` et
`DISABLE_AI=1`, sans variable `VERCEL`, en environnement non production.
Ce mode est refusé sur Vercel, y compris en preview, et dans `next start`.
Il ne doit jamais être utilisé comme raccourci de déploiement.

## Références

- [Clerk : Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [Clerk : codes courriel](https://clerk.com/docs/guides/development/custom-flows/authentication/email-sms-otp)
- [OWASP : contrôle des autorisations](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
