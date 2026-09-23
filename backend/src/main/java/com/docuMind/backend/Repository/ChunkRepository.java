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
