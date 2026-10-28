"""Builds rapport_ecrans_web.pdf: the new GreenSense web screens, one section per screenshot.

Screenshots go in captures/ under the names listed in SCREENS. A missing one is drawn as a
placeholder box with its file name, so the report can be built before every capture is taken.

    python generer_rapport.py
"""
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable, Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

HERE = Path(__file__).parent
CAPTURES = HERE / "captures"
OUTPUT = HERE / "rapport_ecrans_web.pdf"

AUTHOR = ""  # e.g. "Prénom Nom, stagiaire PHOVA"; left out of the cover when empty
DATE = "Octobre 2026"

BLUE = colors.HexColor("#1A75BC")
NAVY = colors.HexColor("#0F2A49")
INK = colors.HexColor("#1E293B")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#CBD5E1")
WASH = colors.HexColor("#EEF5FB")

FONTS = "/System/Library/Fonts/Supplemental"
pdfmetrics.registerFont(TTFont("Arial", f"{FONTS}/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", f"{FONTS}/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", f"{FONTS}/Arial Italic.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial-Italic")

PAGE_W, PAGE_H = A4
MARGIN = 2 * cm
FRAME_W = PAGE_W - 2 * MARGIN
MAX_IMG_H = 19 * cm

S = {
    "title": ParagraphStyle("title", fontName="Arial-Bold", fontSize=26, leading=31, textColor=NAVY),
    "subtitle": ParagraphStyle("subtitle", fontName="Arial", fontSize=13, leading=18, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="Arial-Bold", fontSize=16, leading=20, textColor=NAVY, spaceBefore=6, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Arial-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=4, spaceAfter=3),
    "meta": ParagraphStyle("meta", fontName="Arial", fontSize=8.5, leading=11, textColor=BLUE, spaceAfter=5),
    "body": ParagraphStyle("body", fontName="Arial", fontSize=10, leading=14.5, textColor=INK, spaceAfter=6),
    "bullet": ParagraphStyle("bullet", fontName="Arial", fontSize=10, leading=14.5, textColor=INK, leftIndent=12, bulletIndent=0, spaceAfter=3),
    "caption": ParagraphStyle("caption", fontName="Arial-Italic", fontSize=8.5, leading=11, textColor=MUTED, alignment=TA_CENTER, spaceBefore=4, spaceAfter=14),
    "cell": ParagraphStyle("cell", fontName="Arial", fontSize=9, leading=12, textColor=INK),
    "cellHead": ParagraphStyle("cellHead", fontName="Arial-Bold", fontSize=9, leading=12, textColor=colors.white),
    "step": ParagraphStyle("step", fontName="Arial-Bold", fontSize=8.5, leading=11, textColor=NAVY, alignment=TA_CENTER),
}

# (part title, [(file, screen title, route · role, description)]); the report follows the maintenance loop
SCREENS = [
    ("Vue d'ensemble", [
        ("01_tableau_de_bord.png", "Tableau de bord",
         "/dashboard · Manager (page d'accueil)",
         "La page d'accueil du manager réunit l'état du parc et le travail de maintenance. "
         "<b>État du parc</b> montre les 24 pompes des sites de Jorf et de Safi par état (en marche, en "
         "attente, en maintenance, en défaut, hors ligne) ; les <b>Alertes en direct</b> levées par le "
         "digital twin et le <b>Débit total</b> des dix dernières minutes. En dessous, trois panneaux tirés de "
         "GreenSense : les <b>ordres de travail</b> encore ouverts, la <b>charge des techniciens</b> et les "
         "<b>rapports en attente de validation</b>. Les données de maintenance se rechargent chaque minute. "
         "Toutes les pages du manager partagent le même cadre : une barre latérale groupée par section "
         "(Vue d'ensemble, Parc, Maintenance, Documentation) et un en-tête avec la cloche des alertes."),
    ]),
    ("Parc : pompes et alertes", [
        ("02_pompe_mesures.png", "Fiche pompe : mesures",
         "/pumps?pompe=PHB2-S-06&amp;vue=mesures · Manager",
         "La liste du parc, filtrable par site, est à gauche ; la pompe choisie s'ouvre à droite avec sa photo, "
         "ses données d'équipement et le bouton <b>Nouvel ordre de travail</b>. Quatre vues se partagent le bas "
         "de la page : Mesures, Interventions, Historique et Documentation. La vue <b>Mesures</b> affiche les "
         "relevés en direct et l'évolution d'une mesure face à ses seuils (pour les vibrations, les zones de la "
         "norme ISO 10816-3 : 4,5 et 7,1 mm/s). La sélection est gardée dans l'adresse, ce qui permet aux autres "
         "pages d'ouvrir directement une pompe."),
        ("03_alerte.png", "Dossier d'alerte",
         "/alerts/:numéro · Manager",
         "Chaque alerte du digital twin ouvre un dossier : ce qui a été mesuré, une description et une "
         "recommandation, la courbe de la mesure sur les sept derniers jours et un <b>fil d'activité</b> qui "
         "garde chaque aggravation, retour à la normale, changement de statut et commentaire. Le manager met "
         "le dossier à jour (Nouvelle, Prise en compte, En cours, Résolue ; priorité) et passe d'un dossier "
         "ouvert au suivant, du plus grave au moins grave. Le bouton <b>Créer un ordre de travail</b> lance "
         "l'étape suivante : c'est le manager qui transforme l'alerte en ordre, pas le système."),
    ]),
    ("Maintenance : de l'alerte à l'ordre de travail", [
        ("04_techniciens.png", "Choix du technicien",
         "/technicians · Manager",
         "La liste des techniciens avec leur site. Quand on arrive depuis une alerte ou une pompe, un bandeau "
         "rappelle l'équipement concerné : il sera déjà renseigné dans l'ordre. Ouvrir une carte affiche "
         "l'adresse du technicien et le bouton <b>Assigner une tâche</b>."),
        ("05_nouvel_ordre.png", "Nouvel ordre de travail",
         "/assign/:email · Manager",
         "Le formulaire de l'ordre : titre, type d'intervention (maintenance, préventive, corrective), "
         "priorité, <b>rapport à remplir</b> choisi parmi les checklists actives, équipement, échéance et "
         "instructions. L'envoi reste bloqué tant que le titre, le type, la checklist et l'équipement manquent, "
         "et l'échéance ne peut pas être dans le passé. Le serveur vérifie à nouveau et explique un refus. "
         "Quand l'ordre répond à une alerte, le dossier l'enregistre et la page revient à l'alerte."),
        ("06_alerte_ordres.png", "Ordres liés à l'alerte",
         "/alerts/:numéro?vue=ordres · Manager",
         "L'onglet <b>Ordres de travail</b> du dossier liste les ordres créés pour cette alerte et où chacun "
         "en est : en cours chez le technicien, rapport à valider, ou clôturé."),
        ("07_ordres.png", "Ordres de travail en cours",
         "/orders · Manager",
         "Les ordres que le manager a assignés et qui ne sont pas terminés (assignés, en cours, bloqués, à "
         "corriger), triés par priorité puis par échéance. Les ordres bloqués ou renvoyés ressortent. Une carte "
         "ouverte montre les instructions. C'est l'équivalent de l'onglet Ordres de l'application mobile."),
        ("08_pompe_interventions.png", "Fiche pompe : interventions",
         "/pumps?pompe=PHB2-S-06&amp;vue=interventions · Manager",
         "Sur la fiche de la pompe, la vue <b>Interventions</b> regroupe ses alertes ainsi que les ordres de "
         "travail et les rapports dont l'équipement est cette pompe."),
        ("09_pompe_documentation.png", "Fiche pompe : documentation",
         "/pumps?pompe=PHB2-S-06&amp;vue=documentation · Manager",
         "La vue <b>Documentation</b> liste les manuels importés dont le nom contient le modèle de la pompe "
         "(aucun pour la PHB2 à ce jour) et ouvre l'assistant, qui répond à partir de ces documents en citant "
         "ses sources."),
    ]),
    ("Revue des rapports", [
        ("10_revue.png", "Rapports à valider",
         "/review · Manager",
         "Les tâches terminées par les techniciens et dont le rapport attend le manager, de la plus ancienne à "
         "la plus récente. Chaque carte donne le verdict du rapport (<b>Conforme</b> ou <b>Non conforme</b> : "
         "le serveur le décide, non conforme dès qu'un point critique est jugé « Mauvais »), le technicien, "
         "l'équipement, la date d'envoi et un repère <b>En retard</b> si l'échéance est dépassée. Ouverte, elle "
         "ajoute la checklist, le type, les dates, le temps passé et les instructions. Le rapport s'ouvre en "
         "lecture seule, tel que le technicien l'a rempli, avec l'aperçu et le téléchargement du PDF. Le "
         "manager le <b>valide</b>, ce qui clôt la tâche, ou le <b>renvoie</b> au technicien avec un commentaire "
         "obligatoire."),
    ]),
    ("Côté technicien", [
        ("13_technicien.png", "Technicien",
         "/tasks · Technicien (rôle USER)",
         "Le technicien garde la barre supérieure, avec les mêmes onglets que dans l'application mobile : "
         "<b>Tâches</b>, <b>Assistant</b> et <b>Documents</b>. L'ordre envoyé par le manager pour PHB2-S-06 "
         "apparaît dans sa liste ; il y accepte ou refuse les tâches qui lui sont assignées."),
    ]),
]

OPTIONAL = [
    ("15_menu_mobile.png", "Sur petit écran",
     "/dashboard · Manager, largeur de téléphone",
     "Sous la largeur d'un ordinateur portable, la barre latérale devient un menu qui s'ouvre depuis "
     "l'en-tête ; les panneaux du tableau de bord passent les uns sous les autres."),
]

ROLES = [
    ("Manager", "Tableau de bord, Pompes, Alertes, Techniciens, Ordres, Revue, Documents, Assistant",
     "Tableau de bord", "Barre latérale"),
    ("Technicien", "Tâches, Assistant, Documents", "Tâches", "Barre supérieure"),
    ("Administrateur", "Importer, Documents, Assistant", "Importer", "Barre supérieure"),
]

LOOP = ["Alerte du digital twin", "Ordre de travail", "Intervention\n(application mobile)", "Revue du rapport", "Validation"]

LIMITS = [
    "<b>Digital twin simulé.</b> Les états des pompes, les mesures et les alertes viennent d'un simulateur "
    "(fleetSimulator.js), signalé par le badge « Simulé ». Seule la source changera quand le vrai twin sera "
    "connecté ; les identifiants des pompes devront alors correspondre au champ équipement des ordres.",
    "<b>Pas de données réelles sur les équipements des sites.</b> Nous ne disposons pas encore de la liste "
    "réelle des équipements de Jorf et de Safi : les 24 pompes affichées, leurs modèles, numéros de série, "
    "dates de mise en service et heures de marche sont des valeurs d'exemple. Elles seront remplacées par "
    "l'inventaire de chaque site dès qu'il sera disponible.",
]


class Placeholder(Flowable):
    """A dashed box standing in for a screenshot not taken yet."""

    def __init__(self, name, height=8 * cm):
        super().__init__()
        self.name, self.width, self.height = name, FRAME_W, height

    def draw(self):
        c = self.canv
        c.setStrokeColor(LINE)
        c.setFillColor(colors.HexColor("#F8FAFC"))
        c.setDash(4, 3)
        c.roundRect(0, 0, self.width, self.height, 8, stroke=1, fill=1)
        c.setFillColor(MUTED)
        c.setFont("Arial-Bold", 11)
        c.drawCentredString(self.width / 2, self.height / 2 + 4, "Capture à insérer")
        c.setFont("Arial", 9.5)
        c.drawCentredString(self.width / 2, self.height / 2 - 12, f"captures/{self.name}")


def screenshot(name):
    path = CAPTURES / name
    if not path.exists():
        return Placeholder(name), False
    w, h = PILImage.open(path).size
    scale = min(FRAME_W / w, MAX_IMG_H / h)
    img = Image(str(path), width=w * scale, height=h * scale)
    img.hAlign = "CENTER"
    return img, True


class Bordered(Flowable):
    """The screenshot with a thin border, so white pages stand out from the paper."""

    def __init__(self, img):
        super().__init__()
        self.img = img
        self.width, self.height = img.drawWidth, img.drawHeight

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        self.img.drawOn(self.canv, 0, 0)
        self.canv.setStrokeColor(LINE)
        self.canv.setLineWidth(0.6)
        self.canv.rect(0, 0, self.width, self.height)


def section(n, file, title, meta, text, part=None):
    img, found = screenshot(file)
    if found:
        img = Bordered(img)
        img.hAlign = "CENTER"
    # a part heading travels with its first screen, never alone at the bottom of a page
    head = ([Paragraph(part, S["h1"])] if part else []) + [Paragraph(title, S["h2"]), Paragraph(meta, S["meta"]), Paragraph(text, S["body"])]
    return [KeepTogether(head + [Spacer(1, 4), img, Paragraph(f"Figure {n} – {title}", S["caption"])])], found


def loop_diagram():
    cells, widths = [], []
    for i, step in enumerate(LOOP):
        cells.append(Paragraph(step.replace("\n", "<br/>"), S["step"]))
        widths.append(2.9 * cm)
        if i < len(LOOP) - 1:
            cells.append(Paragraph("→", ParagraphStyle("arrow", parent=S["step"], textColor=BLUE, fontSize=13)))
            widths.append(0.6 * cm)
    t = Table([cells], colWidths=widths, rowHeights=[1.4 * cm])
    style = [("VALIGN", (0, 0), (-1, -1), "MIDDLE")]
    for i in range(0, len(cells), 2):
        style += [("BACKGROUND", (i, 0), (i, 0), WASH), ("BOX", (i, 0), (i, 0), 0.6, BLUE)]
    t.setStyle(TableStyle(style))
    return t


def roles_table():
    head = [Paragraph(h, S["cellHead"]) for h in ("Rôle", "Pages visibles", "Ouvre sur", "Navigation")]
    rows = [head] + [[Paragraph(v, S["cell"]) for v in row] for row in ROLES]
    t = Table(rows, colWidths=[2.8 * cm, 8 * cm, 3.1 * cm, 3.1 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, WASH]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def decorate(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, PAGE_H - 1.3 * cm, PAGE_W - MARGIN, PAGE_H - 1.3 * cm)
    canvas.setFont("Arial", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, PAGE_H - 1.1 * cm, "GreenSense 4.0 · Interface web")
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 1.1 * cm, "PHOVA")
    canvas.drawCentredString(PAGE_W / 2, 1.1 * cm, str(doc.page))
    canvas.restoreState()


def build():
    story = [
        Spacer(1, 2.5 * cm),
        Paragraph("GreenSense 4.0", ParagraphStyle("kicker", parent=S["subtitle"], textColor=BLUE, fontName="Arial-Bold")),
        Spacer(1, 6),
        Paragraph("Interface web : les nouveaux écrans", S["title"]),
        Spacer(1, 8),
        Paragraph("Intranet du manager, parcours de maintenance et accès par rôle", S["subtitle"]),
        Spacer(1, 6),
        Paragraph(" · ".join(p for p in (AUTHOR, DATE) if p), ParagraphStyle("date", parent=S["subtitle"], fontSize=10.5)),
        Spacer(1, 1.2 * cm),
        Paragraph("Ce qui change", S["h1"]),
        Paragraph(
            "L'application web reprend désormais ce que le manager fait sur l'application mobile (techniciens, "
            "ordres de travail, revue des rapports) et y ajoute un intranet de supervision : un tableau de bord, "
            "une fiche par pompe et un dossier par alerte du digital twin. Chaque rôle ne voit plus que ses "
            "propres pages, comme dans l'application mobile.", S["body"]),
        Spacer(1, 6),
        Paragraph("Accès par rôle", S["h2"]),
        roles_table(),
        Spacer(1, 14),
        Paragraph("Le parcours de maintenance", S["h2"]),
        Paragraph(
            "Les écrans suivent la boucle de maintenance retenue par l'équipe : le manager reçoit l'alerte et "
            "la transforme lui-même en ordre de travail, le technicien intervient et remplit la checklist sur "
            "l'application mobile, puis le manager relit le rapport et le valide ou le renvoie.", S["body"]),
        Spacer(1, 4),
        loop_diagram(),
        PageBreak(),
    ]

    n, missing = 0, []
    parts = SCREENS + [("Annexe", OPTIONAL)] if (CAPTURES / OPTIONAL[0][0]).exists() else SCREENS
    for part, screens in parts:
        for i, (file, title, meta, text) in enumerate(screens):
            n += 1
            flow, found = section(n, file, title, meta, text, part if i == 0 else None)
            story += flow
            if not found:
                missing.append(file)

    story += [PageBreak(), Paragraph("Limites actuelles", S["h1"])]
    story += [Paragraph(item, S["bullet"], bulletText="•") for item in LIMITS]

    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=2 * cm, bottomMargin=2 * cm,
        title="GreenSense 4.0 – Interface web : les nouveaux écrans", author=AUTHOR or "PHOVA",
    )
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    print(f"{OUTPUT.name}: {n} écrans, {len(missing)} capture(s) manquante(s)")
    for m in missing:
        print("  -", m)


if __name__ == "__main__":
    CAPTURES.mkdir(exist_ok=True)
    build()
