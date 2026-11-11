# Démo de douze secondes avec modalités explicites

Fichier livré `nesalio-joyce-12s-interactions-claires.mp4`. Durée de 12,00 secondes, résolution 1920 × 1080, ratio 16:9, vidéo H.264 à 30 images par seconde et piste AAC. L’animation capturée conserve les 15 images par seconde de la version de référence.

La référence est la vidéo conservée dans `../pitch-video-12s-2026-11-04`. Le code de construction de la parabole, ses projections, son cadrage et ses timings est conservé à l’identique. La disposition générale, les polices, les couleurs et les composants du produit sont réutilisés.

## Conversation

Joyce prononce « Le maximum est 2 ? ». Un microphone actif apparaît auprès de son avatar et dans sa bulle de transcription. La transcription est progressive, identifiée par son nom et l’origine vocale du message. Les indicateurs actifs disparaissent à la fin de sa parole.

Nesalio est nommé dans la carte de dialogue, à côté de son avatar. Le haut-parleur et les petites ondes s’activent uniquement pendant ses répliques. Ses mots apparaissent progressivement. Sa question initiale et la note de contexte sont explicitement identifiées comme du texte écrit et restent sans animation vocale.

Pour rendre visibles les deux modalités de l’élève, Joyce écrit sa réponse finale « Le maximum est 5 ! ». Un clavier et un curseur de saisie remplacent le microphone. La phrase est conservée, sa piste vocale est retirée de cette fenêtre et la validation finale reste prononcée par Nesalio. Aucune étape pédagogique n’est ajoutée.

Les plages de parole sont déterminées à partir du signal audio existant. Les mots sont répartis dans ces plages selon leur poids syllabique. Il s’agit d’une progression préparée pour cette démonstration, avec des timings approximatifs par mot.

## Nature de la vidéo

Cette démonstration est scénarisée, avec le profil fictif Joyce et des voix synthétiques. Les transcriptions et les messages sont préparés pour le clip. Ils ne constituent pas une reconnaissance vocale ou un échange avec un modèle en direct.

`prepare-modalities.py` crée la piste et les repères de parole. `communication-timing.json` décrit les mots et le niveau vocal par image. `Conversation.tsx` conserve les ajouts de présentation. `VideoFrame.tsx` et `page.tsx` conservent l’aperçu local. `encode-video.py` exporte le MP4.
