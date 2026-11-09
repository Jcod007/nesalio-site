# Démo Nesalio de douze secondes

Fichier livré `nesalio-joyce-demo-12-secondes.mp4`. Durée contrôlée de 12,00 secondes, résolution 1920 × 1080, ratio 16:9, vidéo H.264 à 30 images par seconde et son AAC. L’animation du tableau est capturée à 15 images par seconde, puis encodée à 30 images par seconde.

La référence principale est la démo de dix secondes conservée dans `../pitch-video-2026-11-04`. Les composants du produit, le tableau Manim, le cadrage, la typographie, les couleurs et le profil de Joyce sont réutilisés. Les répliques restent visibles dans la carte de Nesa et la bulle de Joyce.

## Micro-histoire

De 0 à 3 secondes, Joyce répond « Le maximum est 2 ? ». Nesa dit « Tu confonds x et y du sommet. » La première coordonnée du sommet et la bulle de Joyce reçoivent une mise en évidence discrète.

De 3 à 8 secondes, la courbe f(x) = −(x − 2)² + 3 se trace progressivement. Les projections distinguent x = 2 en violet et y = 3 en vert. Nesa dit « Regarde : le maximum, c’est 3. » La valeur maximale est encadrée sur l’axe vertical.

De 8 à 12 secondes, Nesa demande « Et si le sommet est (4, 5) ? ». Le contexte précise « Même parabole, déplacée. » Cette translation conserve l’ouverture vers le bas, donc le maximum est bien 5. Joyce répond « Le maximum est 5 ! ». Une validation verte apparaît, puis Nesa dit « Exactement ! ».

## Nature de la démonstration

Le clip est scénarisé et utilise des voix synthétiques. Joyce est un profil fictif de démonstration. Les états pédagogiques sont préparés pour le pitch. Cette vidéo illustre le scénario demandé et ne constitue pas une évaluation du diagnostic d’un modèle en conversation improvisée.

Les six répliques demandées sont conservées. Leur débit et leurs pauses ont été ajustés pour respecter les fenêtres de temps. La piste finale est assemblée en PCM avant l’encodage AAC afin de garder des horodatages stables.

`prepare-audio.py`, `assemble-audio.py` et `encode-video.py` conservent les opérations de préparation et d’export. `VideoFrame.tsx` et `page.tsx` conservent l’aperçu local de capture. Les images et les prises vocales sont conservées dans ce dossier.
