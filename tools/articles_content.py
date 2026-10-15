# Contenu des articles (sources vérifiées le 14 octobre 2026).
# Chaque article : slug, titre, description, temps de lecture, corps HTML, sources.

ARTICLES = [
{
 'slug': 'chatgpt-devoirs',
 'seo_title': 'ChatGPT aux devoirs : aide ou béquille ? Ce que dit la recherche',
 'seo_desc': "ChatGPT pour les devoirs de maths au secondaire et au cégep : une étude sur près de 1 000 élèves montre que l'IA qui donne la réponse nuit à l'examen. Conseils pour les élèves et les parents du Québec.",
 'keywords': 'ChatGPT devoirs, IA école, aide aux devoirs, maths secondaire, cégep, élèves Québec, parents, examen du ministère',
 'title': "ChatGPT aux devoirs : aide ou béquille ?",
 'desc': "Une étude auprès de près de 1 000 élèves montre que l'IA qui donne la réponse aide pendant l'exercice, mais nuit à l'examen. Ce qui change tout : les garde-fous.",
 'read': 3,
 'kicker': "IA et apprentissage",
 'body': """
<p class="lead">Au Québec, de plus en plus d'élèves du secondaire et du cégep ouvrent ChatGPT dès qu'un devoir de maths ou de sciences bloque. Un prof de mathématiques au cégep nous l'a résumé en entrevue : beaucoup demandent un corrigé complet, qu'ils ne comprennent pas. Est-ce que ça les aide vraiment ? Une étude publiée en 2025 donne une réponse claire.</p>

<h2>L'expérience</h2>
<p>Des chercheurs de l'Université de Pennsylvanie ont suivi près de 1 000 élèves du secondaire en mathématiques, en Turquie. Pendant des séances d'exercices, certains élèves avaient accès à une version de GPT-4 qui ressemble à ChatGPT (« GPT Base »). D'autres avaient une version avec des garde-fous (« GPT Tutor ») : préparée avec des enseignants, elle donne des indices au lieu de la réponse. Un troisième groupe travaillait sans IA. Ensuite, tous passaient une évaluation <strong>sans</strong> l'IA.</p>

<h2>Les résultats</h2>
<ul>
<li><strong>Pendant les exercices</strong>, l'IA aide beaucoup : les résultats augmentent de 48 % avec GPT Base et de 127 % avec GPT Tutor.</li>
<li><strong>À l'évaluation sans IA</strong>, les élèves qui avaient utilisé GPT Base obtiennent des résultats inférieurs de 17 % à ceux des élèves qui n'avaient jamais eu l'IA.</li>
<li>Avec <strong>GPT Tutor</strong>, cet effet négatif disparaît presque entièrement.</li>
<li>Les élèves qui utilisaient l'IA <strong>surestimaient</strong> ce qu'ils avaient appris, y compris les meilleurs.</li>
</ul>

<h2>Pourquoi l'IA peut nuire</h2>
<p>Apprendre demande un effort : chercher, se tromper, recommencer. Quand l'IA fournit la solution, l'élève saute cet effort. L'exercice est réussi, mais la notion n'est pas construite dans sa tête. Le jour de l'examen, l'outil n'est plus là. Les chercheurs parlent d'une <em>béquille</em> : utile pour avancer, nuisible si on ne marche plus sans elle.</p>
<p>Le problème n'est donc pas l'IA elle-même, mais la façon de l'utiliser. La même technologie, encadrée pour guider plutôt que répondre, n'a pas fait de tort.</p>

<h2>Ce que vous pouvez faire dès ce soir</h2>
<ol>
<li><strong>Demander des indices, pas la réponse.</strong> ChatGPT et Gemini ont maintenant des modes d'étude qui guident pas à pas. On peut aussi l'écrire clairement : « Ne me donne pas la réponse, pose-moi des questions. »</li>
<li><strong>Refaire seul après.</strong> Une fois l'exercice compris, le refaire sans aide, sur une feuille blanche. C'est le vrai test.</li>
<li><strong>Expliquer à voix haute.</strong> Si votre enfant peut vous expliquer la démarche, il l'a comprise. S'il bloque, c'est là qu'il faut revenir.</li>
<li><strong>Comparer avec la méthode du prof.</strong> L'IA propose souvent des démarches qui ne sont pas celles vues en classe ni celles du programme québécois, ce qui peut coûter des points à l'examen, y compris aux examens du ministère.</li>
</ol>

<p>C'est exactement le principe derrière Nesalio : un tuteur qui guide par des questions et vérifie que l'élève sait refaire seul, au lieu de faire le travail à sa place.</p>
""",
 'sources': [
  ("Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö. et Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. <em>Proceedings of the National Academy of Sciences</em>, 122(26), e2422633122.", "https://doi.org/10.1073/pnas.2422633122"),
  ("Knowledge at Wharton. Without guardrails, generative AI can harm education.", "https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education"),
 ],
},
{
 'slug': 'expliquer-en-dessinant',
 'seo_title': 'Expliquer en dessinant : pourquoi on comprend mieux les maths et la physique',
 'seo_desc': 'Pourquoi un schéma et une explication à voix haute aident à comprendre les maths, la physique et la chimie au secondaire et au cégep. Ce que dit la recherche (Mayer).',
 'keywords': 'comprendre les maths, physique secondaire 5, chimie, schéma, apprentissage visuel, prof, élèves Québec',
 'title': "Expliquer en dessinant : ce que dit la recherche",
 'desc': "Des mots et des images, plutôt que des mots seuls. Et une voix plutôt qu'un texte à lire. Deux principes parmi les plus solides de la recherche sur l'apprentissage.",
 'read': 3,
 'kicker': "Comment on apprend",
 'body': """
<p class="lead">Pourquoi un bon prof de maths ou de physique, au secondaire comme au cégep, prend-il toujours la craie ? Pourquoi une notion lue trois fois dans le manuel devient-elle claire quand quelqu'un la dessine en l'expliquant ? La recherche en psychologie cognitive a une réponse précise.</p>

<h2>Principe 1 : des mots et des images</h2>
<p>Le psychologue Richard Mayer, de l'Université de Californie à Santa Barbara, étudie depuis plus de 30 ans comment on apprend avec des explications. Son premier principe est simple : <strong>on apprend mieux avec des mots et des images qu'avec des mots seuls</strong>.</p>
<p>Dans les 11 expériences qu'il a recensées, les élèves qui recevaient un texte avec des illustrations, ou une narration avec une animation, réussissaient mieux les questions de transfert, c'est-à-dire appliquer la notion à un problème nouveau. L'effet médian est de 1,39 écart-type. Dans le monde de l'éducation, c'est un effet très grand : l'élève moyen passe d'environ la moitié de la classe au-dessus de 90 % de ses pairs.</p>

<h2>Principe 2 : une voix plutôt qu'un texte</h2>
<p>Le deuxième principe surprend davantage : face à un schéma ou une animation, <strong>on apprend mieux quand l'explication est dite à voix haute que lorsqu'elle est écrite à l'écran</strong>. Dans les 17 tests recensés, le résultat va dans le même sens à chaque fois, avec un effet médian de 1,02.</p>
<p>La raison : quand le texte est écrit à côté du dessin, les yeux doivent faire des allers-retours. Le canal visuel est surchargé. Quand l'explication est entendue, les yeux restent sur le dessin et les oreilles prennent les mots. Les deux canaux travaillent en même temps.</p>

<h2>Pourquoi ça marche</h2>
<p>Ces résultats s'appuient sur une idée ancienne, la théorie du double codage d'Allan Paivio : notre mémoire traite les mots et les images par deux voies différentes. Une notion codée des deux façons laisse deux traces au lieu d'une, et elle est plus facile à retrouver le jour de l'examen.</p>

<h2>Les limites à connaître</h2>
<p>Ces expériences portent surtout sur des leçons courtes, souvent avec des étudiants universitaires et en laboratoire. En classe, les effets sont généralement plus modestes. Et un dessin n'aide que s'il montre l'essentiel : un schéma décoratif ou trop chargé peut au contraire distraire.</p>

<h2>En pratique</h2>
<ul>
<li><strong>Dessiner l'énoncé.</strong> Devant un problème de physique, de chimie ou une situation-problème de maths en sec 4 ou sec 5, faire un schéma avant de calculer.</li>
<li><strong>Demander à voir.</strong> Quand une explication ne passe pas, en classe, en récupération avec le prof ou avec un tuteur, demander : « Peux-tu me le dessiner ? »</li>
<li><strong>Expliquer en traçant.</strong> Pour réviser, refaire le schéma de mémoire en expliquant à voix haute chaque étape.</li>
</ul>

<p>C'est pour cette raison que Nesalio explique à la voix tout en dessinant au tableau, au rythme de ses mots.</p>
""",
 'sources': [
  ("Mayer, R. E. (2009). Multimedia principle. Dans <em>Multimedia Learning</em> (2e éd., chap. 12, p. 223-241). Cambridge University Press.", "https://doi.org/10.1017/CBO9780511811678.017"),
  ("Mayer, R. E. (2009). Modality principle. Dans <em>Multimedia Learning</em> (2e éd., chap. 11, p. 200-220). Cambridge University Press.", "https://doi.org/10.1017/CBO9780511811678.015"),
  ("Paivio, A. (1971). <em>Imagery and Verbal Processes</em>. Holt, Rinehart and Winston.", None),
 ],
},
{
 'slug': 'tutorat-efficace',
 'seo_title': 'Tuteur en maths : le tutorat marche-t-il vraiment ? Ce que disent les études',
 'seo_desc': "Tuteur privé, récupération, Alloprof : ce que la recherche dit de l'efficacité du tutorat en maths et en sciences, et comment bien choisir un tuteur au Québec (sec 4-5, cégep).",
 'keywords': 'tuteur maths, tutorat Québec, aide aux devoirs, récupération, Alloprof, secondaire 4, secondaire 5, cégep, CST TS SN',
 'title': "Le tutorat individuel marche-t-il vraiment ?",
 'desc': "De l'effet « 2 sigma » de Bloom aux méta-analyses récentes : ce que le tutorat apporte vraiment, et ce qui le rend efficace.",
 'read': 3,
 'kicker': "Ce que disent les données",
 'body': """
<p class="lead">Quand les notes baissent en maths ou en sciences, beaucoup de familles québécoises cherchent un tuteur ou de l'aide aux devoirs. Une famille rencontrée en entrevue y consacrait environ 50 $ par semaine. Est-ce que ça marche ? La réponse courte : oui, nettement. La réponse complète est plus nuancée, et plus utile.</p>

<h2>Le chiffre célèbre : 2 sigma</h2>
<p>En 1984, le chercheur Benjamin Bloom publie un résultat devenu célèbre. Des élèves suivis par un tuteur, seuls ou par deux ou trois, réussissaient beaucoup mieux que ceux d'une classe ordinaire : <strong>l'élève tutoré moyen dépassait 98 % des élèves de la classe</strong>. C'est l'écart de « deux écarts-types », d'où le nom « problème des 2 sigma ».</p>
<p>Mais ce chiffre venait de deux études, menées par deux doctorants. Il a fait le tour du monde, sans être confirmé à cette ampleur par la suite.</p>

<h2>Ce que montrent les études plus récentes</h2>
<ul>
<li>En 2011, Kurt VanLehn compare des dizaines d'études. Le tutorat humain produit un effet de 0,79 écart-type par rapport à l'absence de tutorat : moins que 2, mais très important. Et les systèmes de tutorat informatisés les mieux conçus atteignent 0,76, presque autant.</li>
<li>En 2020, une méta-analyse de Nickow, Oreopoulos et Quan rassemble les expériences les plus rigoureuses, avec répartition au hasard des élèves. Effet moyen : <strong>0,37 écart-type</strong>. Concrètement, un élève au milieu de sa classe passe environ au 64<sup>e</sup> rang sur 100.</li>
</ul>

<h2>Ce qui rend le tutorat efficace</h2>
<p>Les mêmes travaux, résumés par le laboratoire J-PAL du MIT, montrent que tous les tutorats ne se valent pas :</p>
<ul>
<li><strong>Le tuteur compte.</strong> Les programmes menés par des enseignants ou du personnel formé donnent de meilleurs résultats que ceux menés par des bénévoles ou des parents.</li>
<li><strong>La régularité compte.</strong> Les séances fréquentes, plusieurs fois par semaine, fonctionnent mieux qu'une séance isolée.</li>
<li><strong>Le lien avec la classe compte.</strong> Dans les programmes étudiés, le tutorat intégré à la journée d'école a eu en moyenne un effet environ deux fois plus grand qu'après l'école (0,40 contre 0,21).</li>
<li><strong>En maths, l'effet est plus fort chez les plus grands</strong>, ce qui est une bonne nouvelle pour le secondaire et le cégep.</li>
</ul>

<h2>La vraie limite : l'accès</h2>
<p>Bloom le disait déjà en 1984 : le tutorat individuel est trop coûteux pour être offert à tous les élèves. Une heure par semaine aide, mais le blocage arrive souvent le soir, la veille du test, quand le tuteur n'est pas là.</p>
<p>Au Québec, les élèves ont d'autres ressources à ne pas négliger : la récupération avec le prof à l'école, les centres d'aide au cégep, et Alloprof, gratuit. L'important est d'y aller tôt, dès que la notion bloque, et pas la veille de l'examen.</p>

<h2>En pratique, pour choisir un tuteur</h2>
<ul>
<li>Privilégier la <strong>régularité</strong> à la longueur des séances.</li>
<li>Demander que le tuteur suive <strong>la démarche vue en classe</strong>, le programme québécois et la séquence de l'élève (CST, TS ou SN en maths).</li>
<li>Vérifier que l'élève <strong>refait seul</strong>, et pas seulement qu'il « a compris » pendant la séance.</li>
</ul>

<p>C'est ce que Nesalio cherche à rendre accessible : un tuteur aligné sur le cours, disponible chaque soir où ça bloque.</p>
""",
 'sources': [
  ("Bloom, B. S. (1984). The 2 sigma problem: The search for methods of group instruction as effective as one-to-one tutoring. <em>Educational Researcher</em>, 13(6), 4-16.", "https://doi.org/10.3102/0013189X013006004"),
  ("VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. <em>Educational Psychologist</em>, 46(4), 197-221.", "https://doi.org/10.1080/00461520.2011.611369"),
  ("Nickow, A., Oreopoulos, P. et Quan, V. (2020). The impressive effects of tutoring on PreK-12 learning: A systematic review and meta-analysis of the experimental evidence. <em>NBER Working Paper</em> 27476.", "https://www.nber.org/papers/w27476"),
  ("J-PAL (2020). The transformative potential of tutoring for PreK-12 learning outcomes: Lessons from randomized evaluations.", "https://www.povertyactionlab.org/sites/default/files/publication/Evidence-Review_The-Transformative-Potential-of-Tutoring.pdf"),
 ],
},
{
 'slug': 'bien-etudier',
 'seo_title': 'Comment étudier pour un examen de maths ou de sciences : se tester plutôt que relire',
 'seo_desc': "Préparer un examen du ministère ou un examen de cégep : les techniques d'étude qui marchent vraiment selon la recherche (se tester, étaler l'étude). Plan simple sur deux semaines.",
 'keywords': "comment étudier, examen du ministère, examen maths secondaire 4, cégep, cote R, méthodes d'étude, élèves Québec",
 'title': "Bien étudier avant un examen : se tester plutôt que relire",
 'desc': "Relire et surligner rassurent, mais retiennent peu. Les deux techniques les mieux notées par la recherche : se tester et étaler son étude.",
 'read': 3,
 'kicker': "Méthodes d'étude",
 'body': """
<p class="lead">La veille d'un test, d'un examen du ministère ou d'un examen de cégep qui compte pour la cote R, la plupart des élèves font la même chose : relire leurs notes, surligner, refaire les exercices en regardant le corrigé. Ça donne l'impression d'être prêt. La recherche montre que c'est souvent une illusion.</p>

<h2>Dix techniques passées au crible</h2>
<p>En 2013, cinq chercheurs en psychologie, menés par John Dunlosky, ont évalué dix techniques d'étude courantes à partir de centaines d'études. Leur verdict :</p>
<ul>
<li><strong>Utilité élevée :</strong> se tester (questions, exercices sans regarder la solution, cartes mémoire) et étaler son étude dans le temps.</li>
<li><strong>Utilité moyenne :</strong> se demander pourquoi c'est vrai, s'expliquer chaque étape à soi-même, mélanger différents types de problèmes.</li>
<li><strong>Utilité faible :</strong> relire, surligner ou souligner, résumer, et deux techniques de mémorisation par images.</li>
</ul>
<p>Les techniques les plus populaires chez les élèves sont donc parmi les moins efficaces.</p>

<h2>L'expérience qui le montre</h2>
<p>En 2006, Henry Roediger et Jeffrey Karpicke ont fait lire un texte à des étudiants. Un groupe le relisait, l'autre essayait de s'en souvenir sans le regarder. Puis on mesurait ce qu'ils retenaient.</p>
<ul>
<li><strong>Cinq minutes plus tard</strong>, ceux qui avaient relu se souvenaient de plus de choses : 81 % contre 75 %.</li>
<li><strong>Une semaine plus tard</strong>, c'était l'inverse : 56 % pour ceux qui s'étaient testés, 42 % pour ceux qui avaient relu.</li>
<li>Dans une deuxième expérience, lire une fois puis se tester trois fois donnait 61 % après une semaine, contre 40 % pour quatre lectures.</li>
</ul>
<p>Le piège : relire donne l'impression de savoir, parce que le texte semble familier. Se tester est plus inconfortable, justement parce qu'on voit ce qu'on ne sait pas. C'est cet effort qui fixe la notion.</p>

<h2>Un plan simple pour un test dans deux semaines</h2>
<ol>
<li><strong>Commencer tôt et en petites doses.</strong> Trois ou quatre séances de 30 minutes réparties sur deux semaines valent mieux qu'une soirée de trois heures la veille.</li>
<li><strong>Faire des exercices sans regarder la solution.</strong> Ne consulter le corrigé qu'après avoir vraiment essayé.</li>
<li><strong>Mélanger les types de problèmes</strong>, comme à l'examen, au lieu de faire dix fois le même.</li>
<li><strong>Repérer ce qui bloque</strong> et y revenir à la séance suivante, ou en parler au prof en récupération. Souvent, c'est une notion d'une année précédente, par exemple la factorisation vue en sec 3.</li>
<li><strong>Expliquer à voix haute</strong> une démarche complète, sans notes.</li>
</ol>

<p>Chez Nesalio, chaque séance se termine par une question à laquelle l'élève doit répondre seul, et le tuteur revient sur ce qui bloquait la fois d'avant. C'est l'application directe de ces deux principes.</p>
""",
 'sources': [
  ("Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J. et Willingham, D. T. (2013). Improving students' learning with effective learning techniques: Promising directions from cognitive and educational psychology. <em>Psychological Science in the Public Interest</em>, 14(1), 4-58.", "https://doi.org/10.1177/1529100612453266"),
  ("Roediger, H. L. et Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. <em>Psychological Science</em>, 17(3), 249-255.", "https://doi.org/10.1111/j.1467-9280.2006.01693.x"),
  ("Association for Psychological Science (2013). Which study strategies make the grade?", "https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html"),
 ],
},
]
