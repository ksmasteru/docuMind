package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.docuMind.backend.config.Edition;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.ChunkRepository;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.FileContentRepository;
import com.docuMind.backend.repository.PumpModelDocumentRepository;

// « Documents » lists the whole library for every role (plan_documents_list.md): every file, whoever uploaded
// it, sorted by name ignoring case. Without Spring or a database: the repositories are mocks.
class DocumentServiceListTest {

    @Test
    void everyFileSortedByNameWhoeverUploadedIt()
    {
        DocumentRepository documents = mock(DocumentRepository.class);
        when(documents.findAll()).thenReturn(List.of(
            new FileEntity("procédure démontage", "application/pdf", 10, "admin@phova.com"),
            new FileEntity("Fiche technique OTW", "text/plain", 10, "system"),
            new FileEntity("Manuel OTC", "application/pdf", 10, "other-admin@phova.com")));

        DocumentService service = new DocumentService(documents, mock(FileContentRepository.class),
            mock(IngestionService.class), mock(ChunkRepository.class), mock(PumpModelDocumentRepository.class),
            new Edition("rapports"));

        assertEquals(List.of("Fiche technique OTW", "Manuel OTC", "procédure démontage"),
            service.allFiles().stream().map(FileEntity::getName).toList());
    }

    @Test
    void emptyLibrary()
    {
        DocumentRepository documents = mock(DocumentRepository.class);
        when(documents.findAll()).thenReturn(List.of());

        DocumentService service = new DocumentService(documents, mock(FileContentRepository.class),
            mock(IngestionService.class), mock(ChunkRepository.class), mock(PumpModelDocumentRepository.class),
            new Edition("full"));

        assertEquals(List.of(), service.allFiles());
    }
}
