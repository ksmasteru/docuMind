package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.docuMind.backend.exception.InvalidFormException;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.PumpDocumentViews.ModelDocument;
import com.docuMind.backend.model.PumpModelDocument;
import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.LinkOrigin;
import com.docuMind.backend.model.enums.PumpType;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.PumpModelDocumentRepository;

// The documents ticked for pump models (plan_pump_manuals.md part B), without a database: the link table is a list.
class PumpDocumentServiceTest {

    private static final String ADMIN = "admin@phova.com";

    private final List<PumpModelDocument> table = new ArrayList<>();
    private PumpModelDocumentRepository links;
    private DocumentRepository documents;
    private PumpDocumentService service;

    @BeforeEach
    void setUp()
    {
        links = mock(PumpModelDocumentRepository.class);
        documents = mock(DocumentRepository.class);
        when(links.findByFileId(any())).thenAnswer(call -> table.stream()
            .filter(l -> l.getFileId().equals(call.getArgument(0))).toList());
        when(links.findByFileIdIn(anyCollection())).thenAnswer(call -> table.stream()
            .filter(l -> ((java.util.Collection<?>) call.getArgument(0)).contains(l.getFileId())).toList());
        when(links.findByModel(any())).thenAnswer(call -> table.stream()
            .filter(l -> l.getModel() == call.getArgument(0)).toList());
        when(links.save(any(PumpModelDocument.class))).thenAnswer(call -> {
            PumpModelDocument link = call.getArgument(0);
            if (!table.contains(link))
                table.add(link);
            return link;
        });
        org.mockito.Mockito.doAnswer(call -> table.remove(call.getArgument(0))).when(links).delete(any(PumpModelDocument.class));
        service = new PumpDocumentService(links, documents);
    }

    private PumpModelDocument linked(PumpType model, String fileId, DocumentKind kind)
    {
        PumpModelDocument link = new PumpModelDocument(model, fileId, kind, LinkOrigin.ADMIN, ADMIN);
        table.add(link);
        return link;
    }

    @Test
    void tickingModelsAddsTheirLinks()
    {
        var result = service.setModels("f1", List.of(PumpType.OTW, PumpType.OTC), DocumentKind.OWN, ADMIN);

        assertEquals(2, table.size());
        assertEquals(List.of(PumpType.OTW, PumpType.OTC), result.stream().map(l -> l.model()).toList());
        assertEquals(DocumentKind.OWN, result.get(0).kind());
    }

    @Test
    void untickingAModelRemovesOnlyItsLink()
    {
        linked(PumpType.OTW, "f1", DocumentKind.OWN);
        linked(PumpType.OTC, "f1", DocumentKind.OWN);

        service.setModels("f1", List.of(PumpType.OTC), DocumentKind.OWN, ADMIN);

        assertEquals(List.of(PumpType.OTC), table.stream().map(PumpModelDocument::getModel).toList());
    }

    @Test
    void changingTheKindKeepsTheLinkAndRecordsWhoChangedIt()
    {
        PumpModelDocument link = linked(PumpType.OTW, "f1", DocumentKind.OWN);

        service.setModels("f1", List.of(PumpType.OTW), DocumentKind.COMPARABLE, "other@phova.com");

        assertEquals(1, table.size());
        assertEquals(DocumentKind.COMPARABLE, link.getKind());
        assertEquals("other@phova.com", link.getChangedBy());
    }

    // a spec sheet is changed on « Fiches techniques », never by ticking « Documents »
    @Test
    void aSpecSheetLinkSurvivesAnyTicking()
    {
        linked(PumpType.PHB3, "sheet", DocumentKind.SPEC);

        service.setModels("sheet", List.of(), DocumentKind.OWN, ADMIN);
        assertEquals(1, table.size());

        service.setModels("sheet", List.of(PumpType.PHB3), DocumentKind.COMPARABLE, ADMIN);
        assertEquals(1, table.size());
        assertEquals(DocumentKind.SPEC, table.get(0).getKind());
    }

    @Test
    void aSpecSheetCannotBeTicked()
    {
        assertThrows(InvalidFormException.class,
            () -> service.setModels("f1", List.of(PumpType.OTW), DocumentKind.SPEC, ADMIN));
        assertThrows(InvalidFormException.class, () -> PumpDocumentService.parseKind("SPEC"));
    }

    @Test
    void namesAreReadWhateverTheirCaseAndAnUnknownOneIsRefused()
    {
        assertEquals(List.of(PumpType.OTW, PumpType.PHB3), service.parseModels(List.of("otw", " PHB3 ", "OTW")));
        assertEquals(DocumentKind.OWN, PumpDocumentService.parseKind(null));
        assertEquals(DocumentKind.COMPARABLE, PumpDocumentService.parseKind("comparable"));
        assertThrows(InvalidFormException.class, () -> service.parseModels(List.of("OTX")));
        assertThrows(InvalidFormException.class, () -> PumpDocumentService.parseKind("MANUAL"));
    }

    @Test
    void aModelsDocumentsComeSheetFirstThenPhovasThenComparable()
    {
        linked(PumpType.OTW, "cmp", DocumentKind.COMPARABLE);
        linked(PumpType.OTW, "own", DocumentKind.OWN);
        linked(PumpType.OTW, "sheet", DocumentKind.SPEC);
        linked(PumpType.PHB2, "other", DocumentKind.OWN);
        when(documents.findAllById(any())).thenReturn(List.of(
            new FileEntity("AHLSTAR.pdf", "application/pdf", 10, ADMIN),
            new FileEntity("Procédure OTW", "application/pdf", 10, ADMIN),
            new FileEntity("Fiche technique OTW", "text/plain", 10, "system")));
        // FileEntity draws its own id: give the table's file ids to the three files
        List<FileEntity> files = documents.findAllById(List.of());
        table.stream().filter(l -> l.getModel() == PumpType.OTW).forEach(l -> {
            FileEntity file = files.stream().filter(f -> switch (l.getFileId()) {
                case "cmp" -> f.getName().equals("AHLSTAR.pdf");
                case "own" -> f.getName().equals("Procédure OTW");
                default -> f.getName().startsWith("Fiche");
            }).findFirst().orElseThrow();
            file.setId(l.getFileId());
        });

        List<ModelDocument> result = service.documentsOf(PumpType.OTW);

        assertEquals(List.of("Fiche technique OTW", "Procédure OTW", "AHLSTAR.pdf"),
            result.stream().map(ModelDocument::title).toList());
        assertEquals(List.of(DocumentKind.SPEC, DocumentKind.OWN, DocumentKind.COMPARABLE),
            result.stream().map(ModelDocument::kind).toList());
    }

    // the report platform has no pump registry: the model only comes from the equipment's code
    @Test
    void theModelTheCodeStartsWith()
    {
        assertEquals(PumpType.PHB3, service.resolve("PHB3-J-07").model());
        assertEquals("CODE", service.resolve("PHB3-J-07").source());
        assertEquals(PumpType.OTC, service.resolve("OTC125-45").model());
        assertEquals(PumpType.OTW, service.resolve("otw-jorf-01").model());
        assertNull(service.resolve("OTWX-1").model());
        assertNull(service.resolve("P-101").model());
        assertNull(service.resolve("  ").model());
        assertNull(service.resolve(null).model());
    }
}
