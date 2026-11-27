package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.docuMind.backend.config.Edition;
import com.docuMind.backend.exception.FileNotSupportedException;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.ChunkRepository;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.FileContentRepository;
import com.docuMind.backend.repository.PumpModelDocumentRepository;

// The report platform runs without analysis-service, so it refuses CSV/Excel uploads instead of saving a document
// whose ingestion then fails quietly (plan_remove_analysis_service.md). The full platform still takes them.
// Without Spring or a database: the repositories and the ingestion are mocks.
class DocumentServiceEditionTest {

    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private DocumentRepository documents;
    private IngestionService ingestion;

    @BeforeEach
    void setUp()
    {
        documents = mock(DocumentRepository.class);
        ingestion = mock(IngestionService.class);
        when(documents.save(any(FileEntity.class))).thenAnswer(call -> call.getArgument(0));
    }

    private DocumentService service(String edition)
    {
        return new DocumentService(documents, mock(FileContentRepository.class), ingestion,
            mock(ChunkRepository.class), mock(PumpModelDocumentRepository.class), new Edition(edition));
    }

    private static MockMultipartFile file(String name, String contentType)
    {
        return new MockMultipartFile("file", name, contentType, "a,b\n1,2\n".getBytes());
    }

    @Test
    void reportPlatformRefusesCsv()
    {
        assertThrows(FileNotSupportedException.class,
            () -> service("rapports").uploadFile(file("mesures.csv", "text/csv"), null, "admin"));
        verify(documents, never()).save(any());
        verify(ingestion, never()).ingest(any(), any(), anyString(), anyString(), any());
    }

    @Test
    void reportPlatformRefusesExcel()
    {
        assertThrows(FileNotSupportedException.class,
            () -> service("rapports").uploadFile(file("stock.xlsx", XLSX), null, "admin"));
        assertThrows(FileNotSupportedException.class,
            () -> service("rapports").uploadFile(file("stock.xls", "application/vnd.ms-excel"), null, "admin"));
        verify(documents, never()).save(any());
    }

    @Test
    void reportPlatformStillTakesPdfAndText() throws Exception
    {
        service("rapports").uploadFile(file("manuel_OTW.pdf", "application/pdf"), null, "admin");
        service("rapports").uploadFile(file("notes.txt", "text/plain"), null, "admin");
        verify(ingestion).ingest(any(), any(), eq("manuel_OTW.pdf"), eq("pdf"), any());
        verify(ingestion).ingest(any(), any(), eq("notes.txt"), eq("plain"), any());
    }

    @Test
    void fullPlatformStillTakesSpreadsheets() throws Exception
    {
        service("full").uploadFile(file("mesures.csv", "text/csv"), null, "admin");
        service("full").uploadFile(file("stock.xlsx", XLSX), null, "admin");
        verify(ingestion).ingest(any(), any(), eq("mesures.csv"), eq("csv"), any());
        verify(ingestion).ingest(any(), any(), eq("stock.xlsx"),
            eq("vnd.openxmlformats-officedocument.spreadsheetml.sheet"), any());
    }
}
