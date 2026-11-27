package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import com.docuMind.backend.exception.FileNotSupportedException;
import com.docuMind.backend.exception.InvalidFormException;
import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.PumpDocumentViews.SpecSheet;
import com.docuMind.backend.model.PumpModelDocument;
import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.LinkOrigin;
import com.docuMind.backend.model.enums.PumpType;
import com.docuMind.backend.repository.PumpModelDocumentRepository;

// The spec sheets installed by the app and kept up to date by the admin (plan_pump_manuals.md §7), without a
// database or OpenAI: the library and the link table are maps and lists.
class SpecSheetServiceTest {

    private static final byte[] BUNDLED = "Fiche technique PHOVA : pompe OTW.\nDébit : jusqu’à 1250 m3/h.\n".getBytes(StandardCharsets.UTF_8);

    private final List<PumpModelDocument> table = new ArrayList<>();
    private final Map<String, FileEntity> library = new HashMap<>();
    private final Map<String, byte[]> contents = new HashMap<>();
    private PumpModelDocumentRepository links;
    private DocumentService documents;
    private SpecSheetService service;

    @BeforeEach
    void setUp()
    {
        links = mock(PumpModelDocumentRepository.class);
        documents = mock(DocumentService.class);
        when(links.findFirstByModelAndKind(any(), any())).thenAnswer(call -> table.stream()
            .filter(l -> l.getModel() == call.getArgument(0) && l.getKind() == call.getArgument(1)).findFirst());
        when(links.findByKind(any())).thenAnswer(call -> table.stream().filter(l -> l.getKind() == call.getArgument(0)).toList());
        when(links.save(any(PumpModelDocument.class))).thenAnswer(call -> {
            table.add(call.getArgument(0));
            return call.getArgument(0);
        });
        when(documents.storeDocument(anyString(), any(), anyString(), anyString(), anyString())).thenAnswer(call -> {
            FileEntity file = new FileEntity(call.getArgument(0), call.getArgument(2), ((byte[]) call.getArgument(1)).length, call.getArgument(4));
            library.put(file.getId(), file);
            contents.put(file.getId(), call.getArgument(1));
            return file;
        });
        doAnswer(call -> {
            String id = call.getArgument(0);
            library.remove(id);
            contents.remove(id);
            table.removeIf(l -> l.getFileId().equals(id));
            return null;
        }).when(documents).deleteFile(anyString());
        when(documents.getFileMetaData(anyString())).thenAnswer(call -> library.get(call.<String>getArgument(0)));
        when(documents.getFileData(anyString())).thenAnswer(call ->
            new FileContent(call.getArgument(0), contents.get(call.<String>getArgument(0)), "ignore", "x"));
        service = new SpecSheetService(links, documents);
        ReflectionTestUtils.setField(service, "self", service);
    }

    private PumpModelDocument sheetOf(PumpType model)
    {
        return table.stream().filter(l -> l.getModel() == model && l.getKind() == DocumentKind.SPEC).findFirst().orElseThrow();
    }

    @Test
    void aBundledSheetIsInstalledOnceLinkedAsTheModelsSheet()
    {
        assertEquals("installed", service.installOne(PumpType.OTW, BUNDLED));
        assertNull(service.installOne(PumpType.OTW, BUNDLED)); // the next start: nothing to do

        verify(documents, times(1)).storeDocument(eq("Fiche technique OTW"), any(), eq("text/plain"), eq("plain"), eq("system"));
        PumpModelDocument link = sheetOf(PumpType.OTW);
        assertEquals(LinkOrigin.INSTALLED, link.getOrigin());
        assertEquals(SpecSheetService.sha256(BUNDLED), link.getInstalledHash());
        assertEquals(1, library.size());
    }

    @Test
    void aNewerBundledSheetReplacesOneTheAdminNeverTouched()
    {
        service.installOne(PumpType.OTW, BUNDLED);
        String first = sheetOf(PumpType.OTW).getFileId();
        byte[] newer = "Fiche technique PHOVA : pompe OTW.\nVitesse de rotation : jusqu’à 2960 tr/min.\n".getBytes(StandardCharsets.UTF_8);

        assertEquals("updated from the bundle", service.installOne(PumpType.OTW, newer));

        verify(documents).deleteFile(first);
        assertEquals(1, library.size());
        assertEquals(SpecSheetService.sha256(newer), sheetOf(PumpType.OTW).getInstalledHash());
    }

    @Test
    void theAdminsSheetIsNeverOverwrittenByTheBundle()
    {
        service.installOne(PumpType.OTW, BUNDLED);
        service.saveText(PumpType.OTW, "Fiche technique PHOVA : pompe OTW.\nVitesse de rotation : 2960 tr/min.", "admin@phova.com");
        String adminSheet = sheetOf(PumpType.OTW).getFileId();

        assertNull(service.installOne(PumpType.OTW, "anything newer".getBytes(StandardCharsets.UTF_8)));

        assertEquals(adminSheet, sheetOf(PumpType.OTW).getFileId());
        assertEquals(LinkOrigin.ADMIN, sheetOf(PumpType.OTW).getOrigin());
    }

    @Test
    void anEditMakesANewSheetAndDeletesThePreviousOne()
    {
        service.installOne(PumpType.PHB2, BUNDLED);
        String previous = sheetOf(PumpType.PHB2).getFileId();

        SpecSheet saved = service.saveText(PumpType.PHB2, "  Nouvelle fiche PHB2.  ", "admin@phova.com");

        verify(documents).deleteFile(previous);
        assertEquals(1, library.size());
        assertEquals("Nouvelle fiche PHB2.\n", saved.text());
        assertEquals("Fiche technique PHB2", saved.title());
        assertEquals("admin@phova.com", saved.changedBy());
        assertEquals(LinkOrigin.ADMIN, saved.origin());
    }

    @Test
    void anEmptyTextIsRefused()
    {
        assertThrows(InvalidFormException.class, () -> service.saveText(PumpType.OTW, "   ", "admin@phova.com"));
        verify(documents, never()).storeDocument(anyString(), any(), anyString(), anyString(), anyString());
    }

    @Test
    void aPdfCanReplaceTheSheetButAnImageCannot()
    {
        MockMultipartFile pdf = new MockMultipartFile("file", "fiche.pdf", "application/pdf", new byte[] { 1, 2, 3 });
        SpecSheet saved = service.replaceWithFile(PumpType.PHH, pdf, "admin@phova.com");

        assertEquals("application/pdf", saved.contentType());
        assertNull(saved.text()); // a PDF is opened, not shown as text
        MockMultipartFile image = new MockMultipartFile("file", "photo.png", "image/png", new byte[] { 1 });
        assertThrows(FileNotSupportedException.class, () -> service.replaceWithFile(PumpType.PHH, image, "admin@phova.com"));
    }

    @Test
    void everyModelIsListedWithOrWithoutASheet()
    {
        service.installOne(PumpType.OTW, BUNDLED);

        List<SpecSheet> all = service.all();

        assertEquals(PumpType.values().length, all.size());
        SpecSheet otw = all.stream().filter(s -> s.model() == PumpType.OTW).findFirst().orElseThrow();
        assertEquals(new String(BUNDLED, StandardCharsets.UTF_8), otw.text());
        SpecSheet phh = all.stream().filter(s -> s.model() == PumpType.PHH).findFirst().orElseThrow();
        assertNull(phh.fileId());
    }

    // the six sheets of resources/specs/ are found and installed (the real files, the library mocked)
    @Test
    void theSixBundledSheetsAreInstalledAtStartup()
    {
        service.installBundledSheets();

        assertEquals(6, table.size());
        for (PumpType model : List.of(PumpType.OTW, PumpType.OTC, PumpType.OTS, PumpType.PHB2, PumpType.PHB3, PumpType.PHH))
            assertEquals("Fiche technique " + model, library.get(sheetOf(model).getFileId()).getName());

        service.installBundledSheets(); // a restart
        assertEquals(6, table.size());
        verify(documents, times(6)).storeDocument(anyString(), any(), anyString(), anyString(), anyString());
    }

    // a sheet whose embedding failed (no excerpts) is embedded again at the next start
    @Test
    void aSheetWithoutExcerptsIsEmbeddedAgain()
    {
        service.installOne(PumpType.OTW, BUNDLED);
        String id = sheetOf(PumpType.OTW).getFileId();
        when(documents.chunkCount(id)).thenReturn(0L);
        when(documents.reingest(id)).thenReturn(true);

        service.installBundledSheets();

        verify(documents).reingest(id);
    }
}
