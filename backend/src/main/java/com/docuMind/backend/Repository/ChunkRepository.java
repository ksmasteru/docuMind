package com.docuMind.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
import com.docuMind.backend.model.DocumentChunks;

@Repository
public interface ChunkRepository extends JpaRepository<DocumentChunks,String>{
    @Query(value = """
    SELECT * FROM document_chunks
    WHERE user_email= :userEmail
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)

List<DocumentChunks> findSimilarChunks(
    @Param("userEmail") String userEmail,
    @Param("embedding") String embedding,
    @Param("limit") int limit
);

    @Query(value = """
        SELECT * FROM  document_chunks
        WHERE  user_email= :userEmail AND
        file_id= :fileId
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
    """, nativeQuery = true)
List<DocumentChunks> findSimilarChunksinDocument(
    @Param("userEmail") String userEmail,
    @Param("embedding") String embedding,
    @Param("limit") int limit,
    @Param("fileId") String fileId
);
    // Same nearest-neighbour search as above, but it also hands back the
    // distance. The database computes it either way to do the ORDER BY; not
    // selecting it threw away the only signal that says whether a "match" is
    // real or just the least-unrelated chunk in the corpus.
    @Query(value = """
    SELECT id AS "id",
           file_id AS "fileId",
           chunk_text AS "chunkText",
           embedding <=> CAST(:embedding AS vector) AS "distance"
    FROM document_chunks
    WHERE user_email = :userEmail
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)
    List<ChunkMatch> findSimilarChunksWithDistance(
        @Param("userEmail") String userEmail,
        @Param("embedding") String embedding,
        @Param("limit") int limit
    );

    @Query(value = """
    SELECT id AS "id",
           file_id AS "fileId",
           chunk_text AS "chunkText",
           embedding <=> CAST(:embedding AS vector) AS "distance"
    FROM document_chunks
    WHERE user_email = :userEmail AND file_id = :fileId
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)
    List<ChunkMatch> findSimilarChunksInDocumentWithDistance(
        @Param("userEmail") String userEmail,
        @Param("embedding") String embedding,
        @Param("limit") int limit,
        @Param("fileId") String fileId
    );

    // One search across several files, so the top chunks are ranked against
    // each other. Searching file by file and appending the results gave each
    // file its own top N, and the combined list was no longer ordered by distance.
    // fileIds must not be empty: "IN ()" is invalid SQL.
    @Query(value = """
    SELECT id AS "id",
           file_id AS "fileId",
           chunk_text AS "chunkText",
           embedding <=> CAST(:embedding AS vector) AS "distance"
    FROM document_chunks
    WHERE user_email = :userEmail AND file_id IN (:fileIds)
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)
    List<ChunkMatch> findSimilarChunksInDocumentsWithDistance(
        @Param("userEmail") String userEmail,
        @Param("embedding") String embedding,
        @Param("limit") int limit,
        @Param("fileIds") List<String> fileIds
    );

    // The chat's two searches (AskService.answerPhovaWithAiRag): over the shared documentation, whoever
    // uploaded it. The manuals are imported by the admin or a manager, and the « Documents » page already
    // shows every upload to everyone; filtered by the asker's e-mail, a technician's question found nothing.
    @Query(value = """
    SELECT id AS "id",
           file_id AS "fileId",
           chunk_text AS "chunkText",
           embedding <=> CAST(:embedding AS vector) AS "distance"
    FROM document_chunks
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)
    List<ChunkMatch> findSimilarSharedChunks(
        @Param("embedding") String embedding,
        @Param("limit") int limit
    );

    // fileIds must not be empty: "IN ()" is invalid SQL.
    @Query(value = """
    SELECT id AS "id",
           file_id AS "fileId",
           chunk_text AS "chunkText",
           embedding <=> CAST(:embedding AS vector) AS "distance"
    FROM document_chunks
    WHERE file_id IN (:fileIds)
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)
    List<ChunkMatch> findSimilarSharedChunksInFiles(
        @Param("embedding") String embedding,
        @Param("limit") int limit,
        @Param("fileIds") List<String> fileIds
    );

    // how many excerpts a document has: 0 when its embedding failed (DocumentService.reingest)
    long countByFileId(String fileId);

    // The chat for a pump whose model has documents ticked for it (plan_pump_manuals.md part C, scope MANUALS): the
    // documents ticked for that model, and the general ones (ticked for no model). Another model's documents are
    // left out.
    @Query(value = """
    SELECT c.id AS "id",
           c.file_id AS "fileId",
           c.chunk_text AS "chunkText",
           c.embedding <=> CAST(:embedding AS vector) AS "distance"
    FROM document_chunks c
    WHERE c.file_id IN (SELECT d.file_id FROM pump_model_document d WHERE d.model = :model)
       OR NOT EXISTS (SELECT 1 FROM pump_model_document d WHERE d.file_id = c.file_id)
    ORDER BY c.embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)
    List<ChunkMatch> findSimilarChunksForModel(
        @Param("embedding") String embedding,
        @Param("limit") int limit,
        @Param("model") String model
    );

    // every excerpt of one document, in order, with its distance to the question: the model's spec sheet, always put
    // first in the chat's excerpts (§5)
    @Query(value = """
    SELECT c.id AS "id",
           c.file_id AS "fileId",
           c.chunk_text AS "chunkText",
           c.embedding <=> CAST(:embedding AS vector) AS "distance"
    FROM document_chunks c
    WHERE c.file_id = :fileId
    ORDER BY c.chunk_index
    """, nativeQuery = true)
    List<ChunkMatch> findChunksOfFile(
        @Param("embedding") String embedding,
        @Param("fileId") String fileId
    );

    interface ChunkMatch {
        String getId();
        String getChunkText();
        Double getDistance();
        // Getter-style name on purpose: Spring Data maps projection methods by
        // JavaBean property, so a bare fileId() is not recognised and throws.
        String getFileId();
    }
    // if we have multiplel files uploading the same content we should delete all those files.
    @Modifying
    @Transactional
    @Query(value = """
        DELETE FROM document_chunks
        WHERE file_id = :fileId
        """, nativeQuery = true)
    int deleteFileChunks(
        @Param("fileId") String fileId);
    
}
