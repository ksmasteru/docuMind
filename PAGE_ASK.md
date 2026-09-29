# Page « Ask » : poser une question à l'assistant

> Aide-mémoire à garder à côté du site pendant la présentation.
> Adresse : **http://localhost:5173/ask**

---

## Ce que l'on voit à l'écran

```
┌─────────────────────────────────────────────┐
│            Que voulez-vous savoir ?         │  ① Titre
│  Posez une question sur une pompe ou sur    │
│  son entretien.                             │
│                                             │
│   👷 Tous les combien vidanger la PHB2 ?    │  ② Question
│   🤖 Toutes les 4000 heures de              │  ③ Réponse
│      fonctionnement, ou au moins tous       │
│      les 6 mois.                            │
│      sources : HDX.pdf                      │  ④ Source
│                                             │
│  [ Ex. : fréquence de vidange d'huile… ] ➤  │  ⑤ Zone de saisie
└─────────────────────────────────────────────┘
```

| # | Élément | À dire |
|---|---|---|
| ① | Titre | L'assistant est dédié aux pompes et à leur entretien. |
| ② | Question | Le technicien écrit comme il parle, même vite ou avec des fautes. **Entrée** envoie, **Maj + Entrée** va à la ligne. |
| ③ | Réponse | Courte, avec les chiffres **exactement** comme dans le manuel. |
| ④ | Source | Le document utilisé : on peut toujours vérifier. |
| ⑤ | Saisie | Un exemple de question est affiché pour guider l'utilisateur. |

---

## Ce qui se passe derrière, en 6 étapes

```
  👷 « Tous les combien vidanger la PHB2 ? »
      │
      ▼
  ① Quelle pompe ? ─────────► PHB2 reconnue
      │                        → recherche limitée à son manuel (HDX.pdf)
      ▼
  ② Empreinte de la question ► même principe que pour les fiches
      │
      ▼
  ③ Recherche ──────────────► les 12 fiches les plus proches
      │
      ▼
  ④ Rédaction ──────────────► l'IA lit ces 12 fiches, et seulement elles
      │
      ▼
  ⑤ Vérification ───────────► réponse trouvée ? sinon, le dire
      │
      ▼
  ⑥ Affichage + enregistrement
```

### ① Quelle pompe ?
L'assistant repère le nom de la pompe dans la question : **OTW, OTC, OTS, PHB2, PHB3, PHH**.

Chaque pompe PHOVA est associée à la **documentation constructeur de référence** chargée dans le système :

| Pompe PHOVA | Documentation de référence | Chargée ? |
|---|---|---|
| OTW | AHLSTAR | ✅ |
| PHB2 | HDX | ✅ |
| OTC, OTS, PHB3, PHH | Durco Mark 3, Warman AH, DMX, HPX | ❌ pas encore |

La recherche est alors **limitée aux documents de cette pompe** : les chiffres d'une autre machine ne peuvent pas se mélanger à la réponse.

- **Deux pompes citées** → l'assistant demande d'en choisir une seule.
- **Aucune pompe citée** → la recherche porte sur tous les documents de l'utilisateur.

### ② L'empreinte de la question
La question reçoit une **empreinte de sens**, calculée exactement comme celles des fiches (voir la page Upload).

### ③ La recherche des fiches
La base compare l'empreinte de la question à celles de toutes les fiches, et renvoie **les 12 plus proches**, de la plus proche à la moins proche.

```
  Question ●
            ╲  distance 0.38  ──►  fiche 0   (la plus proche)
             ╲ distance 0.39  ──►  fiche 1
              ╲ …
               ╲ distance 0.44 ──►  fiche 11  (la moins proche des 12)
```

> **Distance** : plus elle est proche de 0, plus la fiche parle du même sujet que la question.

### ④ La rédaction de la réponse
L'IA (modèle **gpt-4o-mini** d'OpenAI) reçoit :

- la question ;
- les 12 fiches, numérotées ;
- des **consignes strictes**.

Les consignes principales :

| Consigne | Pourquoi |
|---|---|
| Répondre **uniquement** à partir des fiches | Pas de connaissance extérieure, pas d'Internet. |
| Ne **jamais inventer** un chiffre, un nom ou une référence | Sécurité sur des machines industrielles. |
| Citer les chiffres **exactement**, avec leur unité | Précision. |
| Comprendre une question mal écrite ou mal dictée | Le technicien tape vite ou parle sur un chantier bruyant. |
| Lire les tableaux, même aplatis sur une ligne | Beaucoup de valeurs sont dans des tableaux. |
| Répondre en partie si seule une partie est couverte | Une réponse partielle vaut mieux qu'un refus. |
| Terminer par les **sources** | Traçabilité. |

### ⑤ La vérification

```
                 Les fiches parlent-elles du sujet ?
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
         ✅ Oui                       ❌ Non
   réponse + sources           l'assistant répond « null » :
                               la documentation ne couvre
                               pas cette question
```

L'assistant **préfère dire qu'il ne sait pas plutôt que d'inventer**.

### ⑥ Affichage et enregistrement
- Le nom de la pompe de référence est remplacé par le nom PHOVA dans la réponse (ex. AHLSTAR → **OTW**).
- La réponse s'affiche avec sa source.
- Tout est **enregistré** pour améliorer l'assistant (voir plus bas).

---

## Ce qui est enregistré à chaque question

```
  ❓ Question ──► 💬 Réponse ──► 🗃️ Journal
                                   ├─ la question et la pompe
                                   ├─ le résultat : répondu / pas de réponse / 2 pompes / aucune fiche
                                   ├─ les 12 fiches : distance, rang
                                   └─ les fiches réellement utilisées par l'IA
```

**À quoi ça sert :**
- savoir si les bonnes fiches arrivent en tête ;
- repérer les questions sans réponse, donc les **manques dans la documentation** ;
- préparer l'étape suivante : le technicien pourra **confirmer ou corriger** une réponse, et l'assistant s'enrichira de l'expérience du terrain.

---

## Questions à tester en direct

| Question | Ce que l'on montre |
|---|---|
| Quelle est la fréquence de vidange d'huile de la pompe PHB2 ? | Réponse précise (4000 heures) + source |
| pression eau de barrage garniture OTW ? | Question très courte, quand même comprise |
| Quelle est la capitale de la France ? | L'assistant refuse (« null ») |
| Compare OTW et PHB2 | L'assistant demande de choisir une pompe |

> Astuce : poser ces questions une fois avant la présentation. Les réponses sont ensuite gardées en mémoire (cache) et s'affichent instantanément.

---

## Questions possibles

**Pourquoi 12 fiches et pas tout le manuel ?**
Le manuel entier serait trop long, plus lent et plus coûteux, et noierait l'information utile. 12 fiches suffisent à couvrir une réponse répartie sur plusieurs passages.

**L'IA apprend-elle toute seule sur Internet ?**
Non. Elle ne voit que les fiches qu'on lui transmet pour chaque question.

**Et si la même question est reposée ?**
La réponse est servie depuis la mémoire (cache Redis), sans nouvel appel à l'IA : plus rapide et gratuit.

**Les données partent-elles à l'extérieur ?**
Les 12 fiches utiles sont envoyées à OpenAI pour rédiger la réponse. C'est un point de vigilance identifié dans l'étude WS3.
