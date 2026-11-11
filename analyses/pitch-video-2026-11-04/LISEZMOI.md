# Démonstration de Joyce pour la slide 4

Le fichier livré est `nesalio-joyce-demo-10-secondes.mp4`, en 1920 × 1080, 16:9, H.264 et AAC, avec une durée de 10,00 secondes. La vidéo comporte 30 images par seconde et une animation capturée à 15 images par seconde. Les répliques restent incrustées dans la carte de Nesa et dans la bulle de Joyce.

Cette démonstration est scénarisée. Les images ont été rendues dans un aperçu local qui utilise les composants de Nesalio et son moteur de tableau Manim. Les états sont préparés et avancés image par image, puis assemblés en vidéo. Le clip ne constitue pas un échange improvisé avec le modèle en ligne. Joyce est un profil fictif. Les trois voix ont été synthétisées avec le service vocal de Nesalio. La voix de Joyce a été légèrement rehaussée pour distinguer les intervenantes.

## Dialogue retenu

- De 0 à 2,5 secondes, Nesa dit « Le sommet est en (2, 3). » Le point apparaît et la branche droite commence à se tracer.
- De 2,5 à 4 secondes, Joyce dit « Attends, pourquoi 2 ? » Le tracé reste figé et l’état de pause est visible.
- De 4 à 9,5 secondes, Nesa dit « Regarde, x moins deux vaut zéro pour x égal deux. Le sommet est donc là. » La parenthèse est mise en violet. La flèche, l’égalité et la droite x = 2 apparaissent. Le sommet pulse.
- Les dernières 0,5 secondes gardent l’image finale en silence.

La dernière réplique a été raccourcie pour tenir la durée demandée. Le graphique garde la même fonction f(x) = −(x − 2)² + 3.

Les scripts d’encodage, les voix et les images sources sont conservés ici. `assemble-audio.py` prépare la piste définitive, puis `encode-video.py` assemble le MP4. Le premier script `encode-audio.py` correspond à un essai écarté.
