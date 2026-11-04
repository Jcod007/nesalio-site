# Comptes Nesalio — activation et sécurité

Cette intégration utilise le SDK officiel Clerk 7.9.24. Les comptes et leurs
courriels sont gérés par Clerk. L'application ne fabrique pas les codes, ne
stocke pas de mots de passe et ne reçoit pas les clés secrètes dans le navigateur.
Le site vitrine et le tuteur sont accessibles sans compte. Les trois premières
réponses du tuteur forment un essai borné ; un compte connecté est ensuite requis.
La transcription cloud reste réservée aux comptes ; les invités peuvent dicter
avec la reconnaissance du navigateur quand elle est disponible, ou écrire.

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

- Vérification de session et de l’origine avant lecture du corps. Un invité
  dispose de trois demandes valides au tuteur ; les réservations persistantes
  sont faites après validation et avant génération. `/api/transcribe` reste
  strictement réservé aux comptes. Les diagnostics et données privées restent protégés.
- Seuls les jetons de session sont acceptés ; aucune identité transmise dans
  les données ou en-têtes du navigateur n'est utilisée comme preuve de connexion.
- Rejet des origines non autorisées et des requêtes signalées `cross-site`.
- Refus sans configuration ou en cas d'erreur du fournisseur (503) ; une session
  absente sans essai disponible donne 401. Le tuteur garde son protocole d'erreurs NDJSON.
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
- Trois réponses invitées acceptées, quatrième refusée avant génération ;
  limite conservée au rafraîchissement et sous requêtes concurrentes.
- Rejet des témoins falsifiés, des origines étrangères et des erreurs de stockage.
- Compte connecté autorisé à continuer sans remettre les compteurs invités à zéro.
- Une séance réelle, micro, voix, tableau et reprise après interruption, connecté.
- Un compte de test distinct pour vérifier les permissions si un historique est ajouté.
- Pas d'ouverture d'accès aux séances par l'identifiant de navigation ou le paramètre `ref`.
- Politique de confidentialité à jour et séparation des environnements vérifiée.

Les tests locaux couvrent les refus, la configuration absente, les origines,
les identités forgées et les cinq opérations protégées. Le parcours complet
par courriel doit être testé avec une instance Clerk réellement configurée.

## Essai sans compte

Définir `TRIAL_COOKIE_SECRET` (au moins 32 octets aléatoires, secret serveur)
et conserver le magasin Blob privé existant. Les compteurs utilisent des lectures
sans cache et des écritures conditionnelles par ETag : aucune limite en mémoire
n’autorise les appels d’essai. Les espaces production, preview et développement
sont isolés. Une panne du magasin refuse les appels payants.

Le témoin `__Host-nesalio_trial` est signé, `HttpOnly`, `Secure`, `SameSite=Lax`,
sans domaine explicite, avec une durée de 30 jours. La limite porte sur trois
demandes valides réservées avant génération : une génération interrompue peut
consommer une réponse ; les entrées invalides ne la consomment pas. Après la
limite, le tableau reste monté ; l’élève se connecte dans la fenêtre Clerk,
puis choisit explicitement « Continuer ma séance ». Aucun appel payant n’est
relancé automatiquement après connexion.

Autres plafonds invités : 48 synthèses vocales de 400 caractères au plus, dans
les 10 minutes suivant une réponse, et 4 envois de commentaires. La voix du
navigateur reste le secours. La transcription serveur reste réservée aux comptes.
Les plafonds journaliers limitent aussi les nouveaux essais et les appels par
empreinte IP HMAC et au total (100 réservations de tuteur par environnement).
L’IP brute n’est jamais écrite dans ces compteurs. Les identifiants fournis par
le navigateur ne remplacent pas le témoin signé.

Ces plafonds rendent le coût invité borné mais ne constituent pas une mesure
exacte des dépenses du fournisseur. Les écritures et lectures Blob consomment
le quota de stockage existant. Effacer les témoins ou changer de réseau peut
permettre un nouvel essai sous les plafonds globaux : ce n’est pas une identité.
Le nettoyage quotidien supprime les compteurs journaliers anciens (7 jours)
et les enregistrements d’essai anciens (31 jours depuis leur dernière écriture).

## Limites qui restent à traiter

Les limites des comptes connectés restent **en mémoire par instance serveur**.
Les invités ont maintenant leurs compteurs partagés ; avant une ouverture large,
étendre les quotas partagés et le budget global aux comptes connectés, avec
une limite de concurrence. Un compte ne suffit pas
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
