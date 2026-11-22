package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import com.docuMind.backend.model.ExpertiseDossier;
import com.docuMind.backend.model.ExpertiseReportV2;
import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.model.SubmissionReport.Caption;
import com.docuMind.backend.model.SubmissionReport.ReportRow;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

// The v2 expertise report and the final file in PHOVA's design (template_phova.pdf,
// plan_report_phova_style.md), rendered with the real templates and fonts, without Spring or a database.
// The sample is the design's own report (23AP08, Réf. 43c75b1a). The PDFs and the report's pages as PNG land
// in target/pdf-preview/, to compare with the design.
class ExpertiseReportPdfTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Path OUT = Path.of("target", "pdf-preview");

    private static SubmissionPdfService service()
    {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding(StandardCharsets.UTF_8.name());
        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        return new SubmissionPdfService(engine);
    }

    // ------------------------------------------------------------------ the tests

    @Test
    void rendersTheReportInPhovasDesign() throws Exception
    {
        SubmissionPdfService service = service();
        byte[] pdf = service.render(complet());
        save("expertise-v2", pdf, service);

        try (PDDocument document = PDDocument.load(pdf)) {
            String cover = text(document, 1, 1);
            assertTrue(cover.contains("RAPPORT D'EXPERTISE"), "kicker, upper case");
            assertTrue(cover.contains("Expertise complète"), "the kind as title");
            assertTrue(cover.contains("Référence : 43c75b1a"), "reference box");
            assertTrue(cover.contains("Client OCP S.A Équipement 23AP08 Fabricant FLOWSERVE"), "facts in the design's order");
            assertFalse(cover.contains("Page -"), "no footer on the cover");

            String about = text(document, 2, 2);
            assertTrue(about.contains("Le présent rapport d’expertise a pour objet"), "page 2 presents the report");
            assertTrue(about.contains("Réf. 43c75b1a"), "header");
            assertTrue(about.contains("Rapport d'expertise · Expertise complète — 23AP08"), "footer");
            assertTrue(about.contains("Page - 2"), "page number");

            assertTrue(text(document, 3, 3).contains("Sommaire"), "contents on page 3");

            String all = text(document, 1, document.getNumberOfPages());
            assertTrue(all.contains("01 - Synthèse et identification"), "chapter heading");
            assertTrue(all.contains("CONSTATS À LA RÉCEPTION :"), "block title");
            assertTrue(all.contains("ÉTAT DES PIÈCES :"), "parts table");
            assertTrue(all.contains("CLIENT / DOSSIER"), "identification group");
            assertTrue(all.contains("02 - Pompe réceptionnée"), "a rubrique's chapter");
            assertTrue(all.contains("Photo 1 — État de la pompe à la réception"), "photo caption");

            // Poppins for the titles, Liberation Sans standing in for Arial; never a PDF base-14 font
            Set<String> fonts = fonts(document);
            assertTrue(fonts.stream().anyMatch(f -> f.contains("Poppins-Bold")), "Poppins Bold embedded: " + fonts);
            assertTrue(fonts.stream().anyMatch(f -> f.contains("Poppins-Regular")), "Poppins Regular embedded: " + fonts);
            assertTrue(fonts.stream().anyMatch(f -> f.contains("LiberationSans") || f.contains("Arial")), "Arial or its stand-in: " + fonts);
            assertFalse(fonts.stream().anyMatch(f -> f.contains("Helvetica") || f.contains("Times")), "no base-14 font: " + fonts);
        }
    }

    @Test
    void rendersAMontageReportAndAPreview() throws Exception
    {
        SubmissionPdfService service = service();
        byte[] montage = service.render(montage());
        save("expertise-v2-montage", montage, service);
        try (PDDocument document = PDDocument.load(montage)) {
            String all = text(document, 1, document.getNumberOfPages());
            assertTrue(all.contains("Montage et essais"), "kind");
            assertTrue(all.contains("Date du montage"), "the montage's date on the cover");
            assertTrue(all.contains("Montage non conforme ·"), "the verdict, first in the synthèse");
            assertTrue(all.contains("POINTS À REPRENDRE :"), "the checks not conforming");
        }

        // a preview not sent: said on the cover and in the header, no reference
        ExpertiseReportV2.Trace preview = new ExpertiseReportV2.Trace("AT-00005", null, 1, 1, null, null, null, null,
                "21/11/2026 18:00", true);
        byte[] pdf = service.render(complet(), preview);
        Files.write(OUT.resolve("expertise-v2-preview.pdf"), pdf);
        try (PDDocument document = PDDocument.load(pdf)) {
            assertTrue(text(document, 1, 1).contains("Aperçu — non envoyé"), "cover");
            assertTrue(text(document, 2, 2).contains("Aperçu — non envoyé"), "header");
        }
    }

    // the assembly report (RASSN-02, forms/workshop/): the same design, its own cover, synthèse and parts table
    @Test
    void rendersTheAssemblyReport() throws Exception
    {
        SubmissionPdfService service = service();
        byte[] pdf = service.render(assemblage());
        save("assemblage", pdf, service);
        try (PDDocument document = PDDocument.load(pdf)) {
            String cover = text(document, 1, 1);
            assertTrue(cover.contains("RAPPORT D'ASSEMBLAGE"), "kicker");
            assertTrue(cover.contains("Assemblage pompe"), "title");
            assertTrue(cover.contains("N° d'ordre de fabrication WH.MO.00533"), "production order");
            assertTrue(cover.contains("N° de série 16C003F"), "serial number, the report's equipment");
            assertTrue(cover.contains("Date d'assemblage 08/10/2026"), "assembly date");

            // no page 2 (its text describes an expertise): the contents come next
            assertTrue(text(document, 2, 2).contains("Sommaire"), "contents on page 2");
            assertFalse(text(document, 1, document.getNumberOfPages()).contains("Le présent rapport"), "no expertise text");

            String all = text(document, 1, document.getNumberOfPages());
            assertTrue(all.contains("Rapport d'assemblage — 16C003F"), "footer");
            assertTrue(all.contains("Assemblage conforme ·"), "verdict from the report's status");
            assertTrue(all.contains("CONFORMITÉ DES PIÈCES :"), "parts table");
            assertTrue(all.contains("Pièce Conformité Commentaire Page"), "its columns");
            assertTrue(all.contains("6 pièces assemblées : 6 conformes"), "a rubrique's line");
            assertFalse(all.contains("Réutilisable"), "conformity, not a recommendation");
            // page 2 of the paper: the pump's two boxes, one ticked; no « Anomalies » state for them
            assertTrue(all.contains("Rotation normale de l'arbre"), "ticked box");
            assertTrue(all.contains("Conformité validée"), "box left unticked");
            assertFalse(all.contains("Anomalies"), "boxes, not findings");
            // page 4: the geometric checks, each with its conformity; the jeu hydraulique's X and J
            assertTrue(all.contains("Faux rond"), "geometric check");
            assertTrue(all.contains("Jeu hydraulique (X)") && all.contains("Jeu hydraulique (J)"), "two values of one check");
            assertTrue(all.contains("Moyenne (mm) Conformité"), "the conformity column");
            // page 5: the seal's « Testé »
            assertTrue(all.contains("Testé"), "the seal's comment");
            // page 7, then the signatures of page 8
            assertTrue(all.contains("08/05/2026"), "the checklist's end date");
            assertTrue(all.contains("Protection de l'aspiration et du refoulement de la pompe"), "the checklist");
            assertTrue(all.contains("Rectification de l'alésage du couvercle arrière"), "points to improve");
            assertTrue(all.contains("VALIDATION MANUFACTURING") && all.contains("VALIDATION QUALITÉ"), "signature boxes");
        }
    }

    @Test
    void rendersTheFinalFileWithTheSameHeaderAndFonts() throws Exception
    {
        SubmissionPdfService service = service();
        ExpertiseReportV2.Trace trace = new ExpertiseReportV2.Trace("AT-00005", "Démontage + expertise", 1, 1,
                "Responsable atelier", "23/02/2024", "9", "DV-00005-1", "21/11/2026 18:00", false);
        ExpertiseReportV2 dismantling = ExpertiseReportV2.of(complet(), service.drawings(), trace);
        ExpertiseReportV2 mounting = ExpertiseReportV2.of(montage(), service.drawings(), trace);
        ExpertiseDossier dossier = new ExpertiseDossier("AT-00005", "23AP08", "ME300-400 FBD FB1", "OCP S.A",
                "21/11/2026 18:00", "19 · Dossier final + livraison", "Pompe remise en état", "7 pièces remplacées",
                "reuse", List.of(new ExpertiseReportV2.Field("Client", "OCP S.A")), dismantling.summary().tiles(),
                null, null, List.of(), List.of(), null,
                List.of(new ExpertiseDossier.PartWork("Arbre", "À remplacer", "replace", "Concentricité hors tolérance", "Remplacement", "PHOVA")),
                List.of(), null, dismantling, mounting,
                List.of(new ExpertiseDossier.Milestone("Réception", "22/02/2024", "Hicham", true)),
                List.of(new ExpertiseDossier.TimelineRow("22/02/2024", "1", "Réception", "Hicham", null, "info")),
                List.of(new ExpertiseDossier.Signature("Technicien", "Hicham", "22/02/2024")));
        byte[] pdf = service.renderDossier(dossier);
        Files.createDirectories(OUT);
        Files.write(OUT.resolve("dossier.pdf"), pdf);
        try (PDDocument document = PDDocument.load(pdf)) {
            assertTrue(text(document, 2, 2).contains("Réf. AT-00005"), "the reports' header");
            assertTrue(text(document, 2, 2).contains("Page - 2"), "the reports' footer");
            Set<String> fonts = fonts(document);
            assertFalse(fonts.stream().anyMatch(f -> f.contains("Helvetica") || f.contains("Times")), "no base-14 font: " + fonts);
        }
    }

    // ------------------------------------------------------------------ the design's report, 23AP08

    private static SubmissionReport complet() throws IOException
    {
        Rows r = new Rows();
        r.identity("Client", "OCP S.A", "Client / dossier");
        r.identity("Adresse", "Complexe industriel Jorf El Youdi, Safi", "Client / dossier");
        r.identity("Entité", "PM/PHOS", "Client / dossier");
        r.identity("N° de commande", "S-OT-7304134", "Client / dossier");
        r.identity("N° d'opération", "115", "Client / dossier");
        r.identity("Repère géographique", "23AP08", "Client / dossier");
        r.identity("Matricule", "2503523", "Identification pompe");
        r.identity("Type", "ME300-400 FBD FB1", "Identification pompe");
        r.identity("Fabricant", "FLOWSERVE", "Identification pompe");
        r.identity("Fluide pompé", "Eau de mer", "Identification pompe");
        r.identity("Raison de la demande d'expertise", "Pompe de transfert", "Motif / expertise");
        r.identity("Date de réception", "22/02/2024", "Motif / expertise");
        r.identity("Date d'expertise", "22/02/2024", "Motif / expertise");
        r.identity("Auteur du rapport de démontage", "GUETTAHI Youssef", "Motif / expertise");
        r.identity("Date du montage", "1/3/2024", "Remontage");
        r.identity("Auteur du rapport de montage", "BYA Amine, GUETTAHI Youssef, LAGHLID, JIBAROU", "Remontage");

        r.photos("Pompe réceptionnée : Photos", "État de la pompe à la réception");
        r.multi("Pompe réceptionnée : Anomalies", List.of("Arbre bloqué"),
                "Produit colmaté", "Rotation libre de l'arbre", "Arbre bloqué", "Chaise de roue dégradée", "Palier dégradé");

        r.part("Inspection des pièces > Corps de pompe", List.of("Bon état"), "Nettoyage et réutilisation");
        r.part("Inspection des pièces > Roue", List.of("Bon état"), "Nettoyage et réutilisation");
        r.part("Inspection des pièces > Palier", List.of("Alésage côté NDE hors tolérance"), null);
        r.part("Inspection des pièces > Roulements", List.of(), "Changement systématique");
        r.part("Inspection des pièces > Arbre", List.of("Ajustements des roulements hors tolérance", "Concentricité hors tolérance"), "Remplacement");
        r.part("Inspection des pièces > Flasque côté pompe", List.of("Bon état"), "Nettoyage et réutilisation");
        r.part("Inspection des pièces > Flasque côté accouplement", List.of("Bon état"), "Nettoyage et réutilisation");
        r.part("Inspection des pièces > Déflecteur", List.of("Dégradé"), "Remplacement");

        r.measure("Contrôles géométriques > Concentricité de l'arbre au démontage : Mesures", null, "concentricite-arbre", false, "0.12", "0.14", "0.13");
        r.text("Contrôles géométriques > Concentricité de l'arbre au démontage : Commentaire", null);
        r.measure("Contrôles géométriques > Déplacement axial au démontage : Mesures", null, "deplacement-axial", false, "0.05", "0.06");
        r.text("Contrôles géométriques > Déplacement axial au démontage : Commentaire", "RAS");

        String page = "Contrôles dimensionnels > Arbre et palier au démontage : ";
        r.measure(page + "J", "Jeux de la pompe (J, X)", "coupe-pompe", false, "0.41", "0.43", "0.40");
        r.measure(page + "X", "Jeux de la pompe (J, X)", null, false, "0.30", "0.31", "0.29");
        r.measure(page + "J5", "Jeux palier / arbre (J5 à J8)", "arbre-palier", false, "0.02", "0.03");
        r.measure(page + "J6", "Jeux palier / arbre (J5 à J8)", null, false, "0.02", "0.02");
        r.measure(page + "J7", "Jeux palier / arbre (J5 à J8)", null, true, "0.09", "0.10");
        r.measure(page + "J8", "Jeux palier / arbre (J5 à J8)", null, false);

        r.text("Garniture mécanique > Identification : Fabricant", "John Crane");
        r.text("Garniture mécanique > Identification : Type", "Type 1");
        r.part("Garniture mécanique > Face stationnaire côté process", List.of("Usure logement du pion"), "Remplacement");
        r.part("Garniture mécanique > Face rotative côté process", List.of("Face cassée"), "Remplacement");
        r.part("Garniture mécanique > Chemise", List.of("Usure des portées de joints"), "Remplacement");
        r.part("Garniture mécanique > Couvercle de boîte à garniture", List.of("Usure de portée de joint"), "Remplacement");

        r.summary("Synthèse des pièces : Tableau récapitulatif");
        r.text("Commentaires supplémentaires : Observations", "Pompe livrée avec son accouplement.");
        r.photos("Pompe assemblée : Photos", "Pompe remontée");

        return report("Rapport d'expertise V2 (complet)", r.rows);
    }

    private static SubmissionReport montage() throws IOException
    {
        Rows r = new Rows();
        r.identity("Client", "OCP S.A", "Client / dossier");
        r.identity("Type", "ME300-400 FBD FB1", "Identification pompe");
        r.identity("Date du montage", "1/3/2024", "Remontage");
        r.measure("Contrôles géométriques > Concentricité de l'arbre au remontage : Mesures", null, "concentricite-arbre", false, "0.03", "0.04");
        r.text("Contrôles géométriques > Concentricité de l'arbre au remontage : Commentaire", null);
        r.measure("Contrôles géométriques > Perpendicularité au remontage : Mesures", null, "perpendicularite", false, "0.02");
        r.text("Contrôles géométriques > Perpendicularité au remontage : Commentaire", null);
        r.photos("Pompe assemblée : Photos", "Pompe remontée");
        r.check("01. Contrôle général de la propreté", "Conforme", null);
        r.check("02. Conformité visuelle des pièces à monter", "Conforme", null);
        r.check("07. Test d'étanchéité de la garniture avant montage", "Non conforme", "Fuite au grain fixe");
        r.check("12. Protection des orifices de la garniture mécanique", "Non applicable", null);
        return report("Rapport d'expertise V2 (montage)", r.rows);
    }

    // the paper report « Rapport d'assemblage pompe WH.MO.00533 OTC450-50 » (RASSN-02), value for value, with its
    // photos (src/test/resources/assemblage/, taken from that PDF); its drawings are the form's own
    private static SubmissionReport assemblage() throws IOException
    {
        Rows r = new Rows();
        r.identity("N° d'ordre de fabrication", "WH.MO.00533", "Ordre de fabrication");
        r.identity("Date d'ordre de fabrication", "06/10/2026", "Ordre de fabrication");
        r.identity("Date de réception des pièces", "08/10/2026", "Ordre de fabrication");
        r.identity("N° d'opération", "WH.MO.00533", "Ordre de fabrication");
        r.identity("Fabricant", "PHOVA Technology", "Identification pompe");
        r.identity("Type", "OTC 450-50", "Identification pompe");
        r.identity("N° de série", "16C003F", "Identification pompe");
        r.identity("Date d'assemblage", "08/10/2026", "Assemblage");

        // page 2: no photo of the pump on the paper; one box ticked out of two
        r.photosFrom("Pompe assemblée : Photos", null, null);
        r.ticks("Pompe assemblée : Commentaires", List.of("Rotation normale de l'arbre"), "Rotation normale de l'arbre", "Conformité validée");

        // page 3: valeurs de montage en mm
        String page = "Contrôles dimensionnels > Arbre et palier : ";
        String[] jeux = { "0.01", "0.02", "0.01", "0.02" };
        for (int i = 0; i < jeux.length; i++)
            r.measure(page + "J" + (i + 1), "Jeux palier / arbre", i == 0 ? "assemblage-arbre-palier" : null, false, jeux[i]);
        String[] concentricites = { "0.01", "0.01", "0", "0", "0.01" };
        for (int i = 0; i < concentricites.length; i++)
            r.measure(page + "C" + (i + 1), "Concentricités", null, false, concentricites[i]);

        // page 3: Assemblage (the shaft has no photo on the paper)
        r.assembled("Assemblage > Roulements", "roulements.jpg", "Conforme", null, "NA");
        r.assembled("Assemblage > Arbre", null, "Conforme", null, "4PL");
        r.assembled("Assemblage > Assemblage roulements et arbre", "assemblage-roulements-arbre.jpg", "Conforme", null, "NA");
        r.assembled("Assemblage > Palier", "palier.jpg", "Conforme", null, "03F");
        r.assembled("Assemblage > Chaise de palier", "chaise-de-palier.jpg", "Conforme", null, "03F");
        r.assembled("Assemblage > Assemblage palier et chaise", "assemblage-palier-chaise.jpg", "Conforme", null, "03F");

        // page 4: Contrôles géométriques, all conformes
        String[][] geometry = { { "Faux rond", "concentricite-arbre", "0.01" }, { "Déplacement radial", "deplacement-radial", "0.05" },
                { "Déplacement axial", "deplacement-axial", "0.01" }, { "Perpendicularité arbre / chaise", "perpendicularite-chaise", "0.1" },
                { "Concentricité arbre / chaise", "concentricite-chaise", "0.05" } };
        for (String[] check : geometry)
        {
            r.measure("Contrôles géométriques > " + check[0] + " : Mesure", null, check[1], false, check[2]);
            r.conformity("Contrôles géométriques > " + check[0], "Conforme", null);
        }
        r.measure("Contrôles géométriques > Jeu hydraulique : X", null, "jeu-hydraulique", false, "2.7");
        r.measure("Contrôles géométriques > Jeu hydraulique : J", null, null, false, "1");
        r.conformity("Contrôles géométriques > Jeu hydraulique", "Conforme", null);

        // pages 5 and 6: Suite assemblage (the seal « Testé »; no photo of the flasque côté GM)
        r.assembled("Suite assemblage > Fond de garniture", "fond-de-garniture.jpg", "Conforme", null, "03F");
        r.assembled("Suite assemblage > Garniture mécanique", "garniture-mecanique.jpg", "Conforme", "Testé", null);
        r.assembled("Suite assemblage > Assemblage garniture", "assemblage-garniture.jpg", "Conforme", "Testé", null);
        r.assembled("Suite assemblage > Roue", "roue.jpg", "Conforme", null, "004F");
        r.assembled("Suite assemblage > Volute", "volute.jpg", "Conforme", null, "004F");
        r.assembled("Suite assemblage > Flasque côté commande", "flasque-cote-commande.jpg", "Conforme", null, "01F");
        r.assembled("Suite assemblage > Flasque côté GM", null, "Conforme", null, "03F");

        // page 7: Liste de contrôle « Montage pompe », item 10 « NA »
        String list = "Liste de contrôle « Montage pompe »";
        r.text(list + " : Ordre de fabrication N°", "WH.MO.00496");
        r.add(list + " : Date fin assemblage", "08/05/2026", "DATE", null, List.of(), List.of(), "En-tête");
        String[] checks = { "Contrôle général de la propreté et conformité visuelle des pièces à remonter", "Contrôle du centrage de l'arbre",
                "Contrôle de la concentricité de la chaise de palier", "Contrôle des jeux des déplacements d'arbre (radial et axial)",
                "Contrôle de la perpendicularité de l'arbre à la chaise de palier", "Test d'étanchéité de la garniture avant montage",
                "Contrôle du serrage de la visserie de la pompe", "Ajustage du jeu hydraulique de la pompe",
                "Test d'étanchéité de la garniture après montage", "Test d'étanchéité de la pompe",
                "Protection des orifices de la garniture mécanique", "Protection de l'aspiration et du refoulement de la pompe" };
        for (int i = 0; i < checks.length; i++)
            r.check(list, String.format("%02d. %s", i + 1, checks[i]), i == 9 ? "Non applicable" : "Conforme", i == 9 ? "NA" : null);

        // page 7: Points à améliorer identifiés
        r.text("Points à améliorer identifiés : Observations", String.join("\n",
                "- Ajout de cale de 0.2 mm sur l'appui avant du boitier entre le boitier et la chaise",
                "- Rectification de l'alésage du couvercle arrière",
                "- Enlèvement de matière de 0.5 mm sur la face du déflecteur",
                "- Diminution de l'épaulement de l'ogive de 0.5 mm"));

        return new SubmissionReport("Rapport d'assemblage pompe", "Inspection", 1, null, "7e21c9d4-5b0a-4f6e-8c3d-2a9b1e0f4c77", "16C003F",
                "08/10/2026", "Ismail DAHMANI", "08/10/2026 17:20", "CONFORME", null, r.rows);
    }

    private static SubmissionReport report(String title, List<ReportRow> rows)
    {
        return new SubmissionReport(title, "Inspection", 1, null, "43c75b1a-7d1e-4c2b-9a51-0f6b2c1d9e88", "23AP08",
                "22/02/2024", "Hicham", "22/02/2024 17:40", "NON_CONFORME", null, rows);
    }

    // the rows of a v2 report, as SubmissionService builds them
    private static final class Rows
    {
        final List<ReportRow> rows = new ArrayList<>();
        int photo = 0;

        void add(String label, String value, String type, JsonNode data, List<String> photos, List<Caption> captions, String group)
        {
            rows.add(new ReportRow(rows.size() + 1, label, null, false, value, null,
                    photos.isEmpty() ? null : photos.get(0), photos, type, data, captions, group));
        }

        void identity(String field, String value, String group)
        {
            add("Informations générales : " + field, value, field.startsWith("Date") ? "DATE" : "TEXT", null, List.of(), List.of(), group);
        }

        void text(String label, String value)
        {
            add(label, value, "TEXT", null, List.of(), List.of(), null);
        }

        void photos(String label, String title) throws IOException
        {
            add(label, null, "IMAGE", null, List.of(photo(++photo)), List.of(new Caption(title, null)), null);
        }

        void multi(String label, List<String> picked, String... choices)
        {
            var data = JSON.createObjectNode();
            data.set("selected", JSON.valueToTree(picked));
            data.set("choices", JSON.valueToTree(List.of(choices)));
            add(label, picked.isEmpty() ? null : String.join(", ", picked), "MULTI_CHOICE", data, List.of(), List.of(), null);
        }

        // a part's page: a photo, its findings, its recommendation (null: none chosen)
        void part(String page, List<String> findings, String recommendation) throws IOException
        {
            String name = page.substring(page.indexOf(" > ") + 3);
            photos(page + " : Photos", name);
            List<String> choices = new ArrayList<>(List.of("Bon état", "Dégradé"));
            findings.stream().filter(f -> !choices.contains(f)).forEach(choices::add);
            multi(page + " : Constats", findings, choices.toArray(String[]::new));
            text(page + " : Commentaire", null);
            var data = JSON.createObjectNode();
            if (recommendation != null) data.put("selected", recommendation);
            data.set("choices", JSON.valueToTree(List.of("Nettoyage et réutilisation", "Réparation et réutilisation", "Remplacement")));
            add(page + " : Recommandation", recommendation, "SINGLE_CHOICE", data, List.of(), List.of(), null);
        }

        void measure(String label, String group, String drawing, boolean out, String... readings)
        {
            var data = JSON.createObjectNode();
            data.set("readings", JSON.valueToTree(List.of(readings)));
            if (readings.length > 0)
                data.put("average", String.format(java.util.Locale.ROOT, "%.3f",
                        List.of(readings).stream().mapToDouble(Double::parseDouble).average().orElse(0)));
            data.put("unit", "mm");
            if (drawing != null) data.put("drawing", "/expertise/" + drawing + ".png");
            if (group != null) data.put("group", group);
            if (out) data.put("out", true);
            add(label, readings.length == 0 ? null : String.join(" · ", readings), "MEASURE", data, List.of(), List.of(), group);
        }

        void summary(String label)
        {
            var data = JSON.createObjectNode();
            var lines = data.putArray("rows");
            lines.addObject().put("quantity", "1").put("description", "Arbre").put("code", "AR-300")
                    .put("recommendation", "Changer").put("decision", "PHOVA").put("remark", "");
            lines.addObject().put("quantity", "2").put("description", "Roulements").put("code", "6316")
                    .put("recommendation", "Changer").put("decision", "Client").put("remark", "");
            add(label, "2 lignes", "PARTS_SUMMARY", data, List.of(), List.of(), null);
        }

        // a part's or the pump's conformity, the remark beside it (the assembly report)
        void conformity(String page, String status, String remark)
        {
            var data = JSON.createObjectNode();
            data.put("remark", true);
            data.put("selected", status);
            data.set("choices", JSON.valueToTree(List.of("Conforme", "Non conforme")));
            data.set("nonConforming", JSON.valueToTree(List.of("Non conforme")));
            rows.add(new ReportRow(rows.size() + 1, page + " : Conformité", null, true, status, remark,
                    null, List.of(), "SINGLE_CHOICE", data, List.of(), null));
        }

        // an assembled part's page, in the form's order: its photo (a file of src/test/resources/assemblage, or
        // none), its conformity and comment, its serial number (null: left blank)
        void assembled(String page, String photoFile, String status, String remark, String serial) throws IOException
        {
            photosFrom(page + " : Photos", photoFile, page.substring(page.indexOf(" > ") + 3));
            conformity(page, status, remark);
            text(page + " : N° de série", serial);
        }

        // a photo from src/test/resources/assemblage (the paper report's), or an empty photo question
        void photosFrom(String label, String file, String title) throws IOException
        {
            if (file == null)
            {
                add(label, null, "IMAGE", null, List.of(), List.of(), null);
                return;
            }
            try (var in = ExpertiseReportPdfTest.class.getResourceAsStream("/assemblage/" + file)) {
                if (in == null) throw new IOException("missing test photo: assemblage/" + file);
                String uri = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(in.readAllBytes());
                add(label, null, "IMAGE", null, List.of(uri), List.of(new Caption(title, null)), null);
            }
        }

        // boxes to tick (checks: true), these ones ticked
        void ticks(String label, List<String> ticked, String... choices)
        {
            var data = JSON.createObjectNode();
            data.set("selected", JSON.valueToTree(ticked));
            data.set("choices", JSON.valueToTree(List.of(choices)));
            data.put("checks", true);
            add(label, ticked.isEmpty() ? null : String.join(", ", ticked), "MULTI_CHOICE", data, List.of(), List.of(), null);
        }

        void check(String field, String status, String remark)
        {
            check("Contrôle de montage", field, status, remark);
        }

        // a numbered check of a checklist, under this rubrique
        void check(String rubrique, String field, String status, String remark)
        {
            var data = JSON.createObjectNode();
            data.put("remark", true);
            data.put("selected", status);
            data.set("choices", JSON.valueToTree(List.of("Conforme", "Non conforme", "Non applicable", "À reprendre")));
            data.set("nonConforming", JSON.valueToTree(List.of("Non conforme", "À reprendre")));
            rows.add(new ReportRow(rows.size() + 1, rubrique + " : " + field, null, false, status, remark,
                    null, List.of(), "SINGLE_CHOICE", data, List.of(), "Contrôles"));
        }
    }

    // a 4:3 JPEG standing in for a phone photo
    private static String photo(int n) throws IOException
    {
        BufferedImage image = new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setPaint(new GradientPaint(0, 0, new Color(120 + n * 7 % 80, 130, 140), 800, 600, new Color(200, 190, 170)));
        g.fillRect(0, 0, 800, 600);
        g.dispose();
        ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", jpeg);
        return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(jpeg.toByteArray());
    }

    // ------------------------------------------------------------------ reading the PDF

    private static void save(String name, byte[] pdf, SubmissionPdfService service) throws IOException
    {
        assertEquals("%PDF", new String(pdf, 0, 4, StandardCharsets.US_ASCII));
        Files.createDirectories(OUT);
        Files.write(OUT.resolve(name + ".pdf"), pdf);
        List<byte[]> pages = service.renderPages(pdf);
        for (int i = 0; i < pages.size(); i++)
            Files.write(OUT.resolve(name + "-page-" + (i + 1) + ".png"), pages.get(i));
    }

    // pages first to last, 1-based; whitespace collapsed
    private static String text(PDDocument document, int first, int last) throws IOException
    {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(first);
        stripper.setEndPage(last);
        return stripper.getText(document).replaceAll("\\s+", " ");
    }

    private static Set<String> fonts(PDDocument document) throws IOException
    {
        Set<String> names = new TreeSet<>();
        for (PDPage page : document.getPages())
            for (COSName font : page.getResources().getFontNames())
                names.add(page.getResources().getFont(font).getName());
        return names;
    }
}
