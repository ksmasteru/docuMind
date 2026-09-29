# Comment fonctionne l'assistant GreenSense 4.0

L'assistant GreenSense 4.0 aide les techniciens à trouver rapidement une information dans les manuels des pompes : une valeur, une procédure, une consigne d'entretien.

**Il ne répond qu'à partir des manuels qu'on lui a donnés.** S'il ne trouve pas la réponse dans ces documents, il le dit, au lieu d'inventer.

On peut le comparer à un **bibliothécaire** : il connaît toutes les pages de la bibliothèque, retrouve les bons passages en quelques secondes, puis résume ce qu'ils disent.

```
   📚 Les manuels          🔎 L'assistant             👷 Le technicien
   (la bibliothèque)  ──►  cherche et résume   ──►   reçoit une réponse
                                                      et sa source
```

Le fonctionnement se fait en trois temps :

1. **On ajoute un manuel** : l'assistant le lit et le range.
2. **Le technicien pose une question** : l'assistant cherche les bons passages.
3. **L'assistant répond** : il rédige une réponse courte et indique ses sources.

---

## 1. On ajoute un manuel

Quand on dépose un manuel (un fichier PDF) dans l'application, l'assistant le prépare pour pouvoir le consulter rapidement.

```
  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │  📄 Manuel   │      │  📖 Lecture  │      │  ✂️ Découpage │      │ 🗂️ Rangement │
  │     PDF      │ ───► │  du texte    │ ───► │  en petites  │ ───► │  dans la     │
  │  déposé      │      │              │      │  fiches      │      │ bibliothèque │
  └──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
```

- **Lecture** : l'assistant récupère tout le texte du manuel.
- **Découpage** : le texte est coupé en **petites fiches** d'environ une page chacune. Chaque fiche reprend un peu de la fin de la précédente, pour ne pas couper une procédure en deux.
- **Rangement** : chaque fiche reçoit une sorte d'**étiquette qui résume son sens**. C'est grâce à cette étiquette que l'assistant retrouve plus tard les bonnes fiches, même si le technicien n'utilise pas exactement les mêmes mots que le manuel.

> Un manuel de 100 pages devient environ une centaine de fiches.

Cette étape ne se fait **qu'une seule fois** par manuel.

---

## 2. Le technicien pose une question

Le technicien peut **écrire** sa question, ou la **dicter** avec le micro de son téléphone.

```
  👷 Question écrite  ─────────────────────────┐
                                               ▼
  🎤 Question dictée  ──►  🔤 Transformée  ──►  ❓ Question
                            en texte
```

Ensuite, l'assistant la traite en trois étapes.

```
  ❓ Question
      │
      ▼
  ┌──────────────────────────────────────────────┐
  │ ① De quelle pompe parle-t-on ?              │
  │   « OTW », « PHB2 »…                         │
  │   → on ne cherche que dans les manuels       │
  │     de cette pompe                           │
  └──────────────────────────────────────────────┘
      │
      ▼
  ┌──────────────────────────────────────────────┐
  │ ② Recherche des bonnes fiches               │
  │   → les 12 fiches les plus proches           │
  │     de la question                           │
  └──────────────────────────────────────────────┘
      │
      ▼
  ┌──────────────────────────────────────────────┐
  │ ③ Lecture de ces 12 fiches uniquement       │
  │   → l'assistant n'utilise rien d'autre       │
  └──────────────────────────────────────────────┘
```

**① De quelle pompe parle-t-on ?**
Si la question cite une pompe (par exemple l'OTW), l'assistant ne cherche **que dans les manuels de cette pompe**. Ainsi, les chiffres d'une autre machine ne peuvent pas se glisser dans la réponse.

**② Recherche des bonnes fiches**
L'assistant compare la question à toutes les fiches de la bibliothèque et garde **les 12 qui s'en rapprochent le plus**.

**③ Lecture de ces fiches uniquement**
L'assistant lit ces 12 fiches et **rien d'autre**. Il n'a pas le droit d'utiliser ce qu'il « sait » par ailleurs, ni d'aller chercher sur Internet.

---

## 3. L'assistant répond

Trois situations sont possibles.

```
                        Les fiches contiennent-elles la réponse ?
                                       │
             ┌─────────────────────────┼─────────────────────────┐
             ▼                         ▼                         ▼
      ✅ Oui                    ❌ Non                    ⚠️ Deux pompes
                                                             dans la question
   Réponse courte           « Je n'ai pas cette           « Merci de poser la
   + chiffres exacts        information dans les           question pour une
   + sources                documents »                    seule pompe »
```

**✅ La réponse est dans les manuels**
L'assistant écrit une réponse courte, avec les chiffres **exactement comme dans le manuel**, et termine par le nom des documents utilisés. Le technicien peut donc toujours vérifier.

> **Question :** « Tous les combien faut-il vidanger l'huile de la pompe PHB2 ? »
> **Réponse :** « Toutes les 4000 heures de fonctionnement, ou au moins tous les 6 mois. »
> *sources : manuel de la PHB2*

**❌ La réponse n'est pas dans les manuels**
L'assistant **le dit clairement** au lieu d'inventer. C'est volontaire : une réponse fausse sur une machine industrielle peut être dangereuse.

**⚠️ La question parle de deux pompes**
L'assistant demande de reposer la question pour une seule pompe, pour éviter de mélanger leurs caractéristiques.

---

## 4. L'assistant garde une trace pour s'améliorer

Chaque question est enregistrée, avec :

- la question posée et la pompe concernée ;
- la réponse donnée ;
- les fiches consultées, et celles qui ont réellement servi à répondre.

```
  ❓ Question ──► 💬 Réponse ──► 🗃️ Enregistrée
                                      │
                                      ▼
                          📈 Plus tard : on repère ce qui
                             marche bien et ce qu'il faut
                             améliorer
```

Prochaine étape prévue : le technicien pourra **confirmer ou corriger** une réponse. Ses corrections enrichiront peu à peu l'assistant avec l'expérience du terrain.

---

## Le parcours complet en un coup d'œil

```
  📄 Manuel ──► 📖 Lu ──► ✂️ Découpé en fiches ──► 🗂️ Rangé
                                                       │
                                                       │  (une seule fois)
  ─────────────────────────────────────────────────────┼─────────────────────
                                                       │  (à chaque question)
                                                       ▼
  👷 Question ──► 🔧 Pompe reconnue ──► 🔎 12 fiches retrouvées
                                               │
                                               ▼
                         💬 Réponse + sources ◄── 🧠 Lecture des fiches
                                │
                                ▼
                         🗃️ Enregistrée pour s'améliorer
```

---

## Questions fréquentes

**L'assistant peut-il se tromper ?**
C'est rare, mais possible, par exemple si une question est très vague. C'est pour cela qu'il **indique toujours ses sources** : en cas de doute, on vérifie dans le manuel.

**Pourquoi répond-il parfois qu'il n'a pas l'information ?**
Parce que la réponse ne se trouve pas dans les manuels chargés. Il préfère le dire plutôt que d'inventer.

**Peut-on lui poser une question avec des fautes, ou très courte ?**
Oui. L'assistant est prévu pour comprendre les questions tapées vite sur un téléphone ou dictées sur un chantier bruyant, par exemple « otw vidange huile ».

**Pour quelles pompes fonctionne-t-il ?**
Pour les pompes dont le manuel a été chargé. Il suffit d'ajouter un manuel pour qu'une nouvelle pompe soit couverte.

**Les informations restent-elles privées ?**
Les manuels sont stockés sur nos serveurs. Pour rédiger une réponse, les quelques passages utiles sont envoyés à un service d'intelligence artificielle externe. Ce point fait l'objet d'une attention particulière.
