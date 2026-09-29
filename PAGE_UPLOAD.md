# Page « Upload » : ajouter un document

> Aide-mémoire à garder à côté du site pendant la présentation.
> Adresse : **http://localhost:5173/upload**

---

## Ce que l'on voit à l'écran

```
┌─────────────────────────────────────────────┐
│  Upload a document                          │
│                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│    Déposer un fichier ici, ou cliquer       │  ① Zone de dépôt
│  │ PDF, TXT, CSV, EXCEL ou MD           │    │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─     │
│  Title  [________________________]          │  ② Titre (obligatoire)
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░  62 %                     │  ③ Barre de progression
│  [ Upload document ]                        │  ④ Bouton d'envoi
└─────────────────────────────────────────────┘
```

| # | Élément | À dire |
|---|---|---|
| ① | Zone de dépôt | On glisse le manuel, ou on clique pour le choisir. |
| ② | Titre | Le nom sous lequel le document sera retrouvé. **Il doit contenir le nom de référence de la pompe** (ex. « AHLSTAR »), car c'est par ce nom que l'assistant sait à quelle pompe appartient le manuel. |
| ③ | Progression | L'envoi du fichier vers le serveur. |
| ④ | Message vert | « Uploaded. It'll show up in search shortly. » : le fichier est reçu, sa préparation continue en arrière-plan. |

---

## Ce qui se passe derrière, en 5 étapes

```
  📄 Manuel PDF
      │
      ▼
  ① Réception ──────► le fichier est enregistré, l'écran répond tout de suite
      │
      ▼   (la suite se fait en arrière-plan)
  ② Lecture ────────► on extrait tout le texte du PDF
      │
      ▼
  ③ Découpage ──────► le texte est coupé en « fiches » de ~500 mots
      │
      ▼
  ④ Empreinte ──────► chaque fiche reçoit une empreinte de son sens
      │
      ▼
  ⑤ Rangement ──────► fiches + empreintes stockées dans la base
      │
      ▼
  ✅ Le document est prêt : l'assistant peut s'en servir
```

### ① Réception
Le fichier est vérifié (type accepté, **20 Mo maximum**), puis enregistré avec son titre.
L'écran répond **immédiatement** : le travail lourd continue en arrière-plan pour ne pas bloquer l'utilisateur.

### ② Lecture du texte
Le texte du PDF est extrait page par page.

> Seul le **texte** est lu. Les images, schémas et photos du manuel ne sont pas compris par l'assistant.

### ③ Découpage en fiches
Un manuel entier est trop long pour être lu à chaque question. On le découpe donc en **fiches d'environ 500 mots**.

Chaque fiche **reprend les 100 derniers mots de la précédente**. Ce chevauchement évite de couper une procédure ou un tableau en plein milieu.

```
 Texte du manuel :  ████████████████████████████████████████████████

 Fiche 0 :          [██████████ 500 mots ██████████]
 Fiche 1 :                                  [██████████ 500 mots ██████████]
 Fiche 2 :                                                      [██████ ...
                                    ◄─100─►              ◄─100─►
                                  mots communs          mots communs
```

> Exemple réel : le manuel AHLSTAR a donné **109 fiches**, le manuel HDX **67 fiches**.

### ④ L'empreinte de sens
Chaque fiche est transformée en une **empreinte numérique** : une longue liste de nombres qui représente **ce dont parle** la fiche, et pas seulement ses mots.

```
 « vidange de l'huile toutes les 4000 heures »  ──►  [0.12, -0.45, 0.88, …]
 « changer le lubrifiant après 4000 h »         ──►  [0.11, -0.43, 0.86, …]
                                                       ▲ empreintes proches :
                                                         même sens, mots différents
```

C'est ce qui permet plus tard de retrouver la bonne fiche **même si le technicien n'emploie pas les mots du manuel**.

> Cette empreinte est calculée par un modèle d'OpenAI (`text-embedding-3-small`). Toutes les fiches d'un document sont envoyées **en un seul appel**.

### ⑤ Rangement
Chaque fiche est enregistrée dans la base de données (PostgreSQL avec l'extension **pgvector**, spécialisée dans la comparaison d'empreintes), avec :

| Information | Exemple |
|---|---|
| Le texte de la fiche | « … Normal oil change intervals are 4000 operating hours … » |
| Son empreinte | [0.12, -0.45, 0.88, …] |
| Son numéro dans le document | fiche n° 36 |
| Le document d'origine | HDX.pdf |
| Le propriétaire | l'utilisateur qui a déposé le fichier |

---

## Cas particuliers

| Type de fichier | Traitement |
|---|---|
| **PDF** | Texte extrait, puis découpé en fiches. |
| **TXT / MD** | Texte lu directement, puis découpé en fiches. |
| **CSV / Excel** | Envoyé à un service d'analyse de données, qui produit un résumé en texte ; ce résumé devient les fiches. |

---

## Questions possibles

**Combien de temps faut-il pour qu'un document soit utilisable ?**
Quelques secondes à une minute selon sa taille. L'écran répond tout de suite, la préparation se termine en arrière-plan.

**Faut-il recommencer à chaque question ?**
Non. Cette préparation se fait **une seule fois** par document.

**Que se passe-t-il si je dépose deux fois le même manuel ?**
Il est enregistré deux fois, et ses fiches apparaissent en double dans les recherches. Mieux vaut supprimer l'ancienne version avant.

**Un utilisateur voit-il les documents des autres ?**
Non. Chaque fiche est liée à son propriétaire, et la recherche ne porte que sur ses propres documents.
