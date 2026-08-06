package com.docuMind.backend.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.FileContentRepository;

@ExtendWith(MockitoExtension.class)
class DocumentServiceTest {

    @Mock
    private DocumentRepository documentRepository;

    @Mock
    private FileContentRepository fileContentRepository;

    @Mock
    private IngestionService ingestionService;

    @InjectMocks
    private DocumentService documentService;

    @Test
    void uploadFile_withValidTextFile_savesEntityAndTriggersIngestion() throws Exception {
        // Arrange
        String textContent = "hello world, this is a test file";
        MockMultipartFile file = new MockMultipartFile(
            "file",                                    // the form field name
            "notes.txt",                               // original filename
            "text/plain",                              // content type — subtype must be in allowedExtensions
            textContent.getBytes(StandardCharsets.UTF_8)
        );

        // documentRepository.save(...) is a mock — by default it would just
        // return null. We tell it to behave like a real repository instead:
        // hand back whatever entity it was given.
        when(documentRepository.save(any(FileEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // Act : hada
        FileEntity result = documentService.uploadFile(file, "My Notes", "hicham@gmail.com");

        // Assert — the returned entity looks right
        assertThat(result.getId()).isNotBlank();
        assertThat(result.getName()).isEqualTo("My Notes");
        assertThat(result.getContentType()).isEqualTo("text/plain");
        assertThat(result.getUserId()).isEqualTo("hicham@gmail.com");

        // Assert — the service actually talked to its dependencies as expected
        verify(documentRepository).save(any(FileEntity.class));
        verify(fileContentRepository).save(any(FileContent.class));
        verify(ingestionService).ingest(any(FileContent.class), any(MultipartFile.class),
            any(String.class), any(FileEntity.class));
    }
}
