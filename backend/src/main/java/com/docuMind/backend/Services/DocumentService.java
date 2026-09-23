package com.docuMind.backend.services;

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotFoundException;
import com.docuMind.backend.exception.FileNotSupportedException;
import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.FileContentRepository;
import com.docuMind.backend.repository.ChunkRepository;
// talks with repsose
@Service
public class DocumentService {
    List<String> allowedExtensions = List.of(
        "pdf", "markdown", "plain", "csv",
        "vnd.ms-excel",                                                  // .xls
        "vnd.openxmlformats-officedocument.spreadsheetml.sheet"          // .xlsx
    );

    private final DocumentRepository documentRepository;

    private final FileContentRepository fileContentRepository;

    private final IngestionService ingestionService;

    private final ChunkRepository chunkRepository;

    
    public DocumentService(DocumentRepository documentRepository, FileContentRepository fileContentRepository,
        IngestionService ingestionService, ChunkRepository chunkRepository)
    {
        this.documentRepository = documentRepository;
        this.fileContentRepository = fileContentRepository;
        this.ingestionService = ingestionService;
        this.chunkRepository = chunkRepository;
    }

    // changed from List<FileEntity> to FileEntity
    // we want this to
    public FileContent getFileData(String id)
    {
        FileContent fileContent = fileContentRepository.findById(id)
                                .orElseThrow(() -> new FileNotFoundException(""));
        return fileContent;
    }

    public FileEntity getFileMetaData(String id)
    {
        FileEntity returnFile = documentRepository.findById(id)
            .orElseThrow(() -> new FileNotFoundException(""));
        return returnFile;
    }

    // One query for every file a set of chunks came from, keyed by file id,
    // instead of a findById per chunk.
    public Map<String, String> getFileNames(Collection<String> ids)
    {
        return documentRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(FileEntity::getId, FileEntity::getName));
    }

    public List<FileEntity> searchFile(String name)
    {
        List<FileEntity> seachedfiles = documentRepository.findByGeneratedNameContainingIgnoreCase(name);
        System.out.println(seachedfiles);
        return seachedfiles;
    }

    public List<FileEntity> filter(String keyword)
    {
        // search in file content :)
        return null;
        /*
        List<FileEntity> filtersearch = documentRepository.findByContentContainingIgnoreCase(keyword);
        return filtersearch;
        */
    }

    @Transactional
    public FileEntity uploadFile(MultipartFile file,
         String title, String userId) throws IOException
    {
        String fileExtension = MediaType.parseMediaType(file.getContentType()).getSubtype();
        if (!allowedExtensions.contains(fileExtension))
            throw new FileNotSupportedException("Unsupported file type---");

        // Read into a plain byte[] now, on the request thread — a MultipartFile's
        // backing temp storage isn't guaranteed to survive past this request, so
        // it can't be handed to the background thread that parses/embeds it.
        // Text extraction (PDF parsing, chunking, embeddings) is the slow,
        // memory-heavy part — deferred entirely to the background so the upload
        // responds immediately instead of risking the request thread on it.
        byte[] rawBytes = file.getBytes();

        FileEntity fileToSave = new FileEntity(title != null ? title : file.getOriginalFilename(),
            file.getContentType(), file.getSize(), userId);

        FileEntity returnFile = documentRepository.save(fileToSave);

        FileContent fileContent = new FileContent(returnFile.getId(), rawBytes, "ignore", returnFile.getUserId());

        FileContent savedFile = fileContentRepository.save(fileContent);

        // Pass the original filename through as a plain String, same reason as
        // rawBytes above — nothing downstream in the async pipeline may touch
        // the MultipartFile itself once this request has returned.
        ingestionService.ingest(savedFile, rawBytes, file.getOriginalFilename(), fileExtension, fileToSave);

        return returnFile;
    }

    // FileEntity uploadedFile = documentService.uploadScannedText(scannedText);
    @Transactional
    public FileEntity uploadScannedText(String text, String userId) throws IOException
    {
        if (text.isBlank())
            throw new FileNotSupportedException("Unsupported file type---");
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        // Timestamped so two scans never collide: deleteFile() and searchFile()
        // both look documents up by name, so a fixed literal would make every
        // scanned page indistinguishable from the last.
        String name = LocalDateTime.now()
            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss")) + ".txt";
        FileEntity fileToSave = new FileEntity(name, MediaType.TEXT_PLAIN_VALUE, bytes.length, userId);
        FileEntity returnFile = documentRepository.save(fileToSave);

        FileContent fileContent = new FileContent(returnFile.getId(), bytes, "ignore", returnFile.getUserId());
        FileContent savedFile = fileContentRepository.save(fileContent);

        // "plain" is the MIME subtype of text/plain — the same form uploadFile
        // derives via getSubtype(), and the value extractChunks() falls through
        // to its plain-text branch on.
        ingestionService.ingest(savedFile, bytes, name, "plain", fileToSave);

        return returnFile;
    }

    // deletes a single file by id
    @Transactional
    public void deleteFile(String id)
    {
        documentRepository.deleteFileById(id);
        int deleted = chunkRepository.deleteFileChunks(id);
        fileContentRepository.deleteById(id);
        System.out.println("Deleted chunks : " +  deleted);
    }

    // this deletes all the files that share the same name.
    // should also delete the file_contents
    // in the future return data to front about deleted files.
    @Transactional
    public void deleteFileByName(String name)
    {
        List<FileEntity> fileToDelete = documentRepository.findByNameContainingIgnoreCase(name);
        if (!fileToDelete.isEmpty())
        {
            int i = 0;
            int deletedChunks = 0;
            int deletedFileEntities = 0;
            while (i < fileToDelete.size())
            {
                deletedFileEntities += documentRepository.deleteFileById(fileToDelete.get(i).getId());
                deletedChunks += chunkRepository.deleteFileChunks(fileToDelete.get(i).getId());
                fileContentRepository.deleteById(fileToDelete.get(i).getId());
                i += 1;
            }
            System.out.println("deleted files : "  + deletedFileEntities + " deleted chuks : " + deletedChunks);
        }
        else
            throw new FileNotFoundException("file not found with name : " + name);
    }

    @Transactional
    public String answer(String question)
    {
        String theAnswer = ingestionService.answer(question);
        return theAnswer;
    }

    public List<FileEntity> getUserFiles(String userId)
    {
        List<FileEntity> files = documentRepository.findByUserId(userId);
        return files;
    }
}
