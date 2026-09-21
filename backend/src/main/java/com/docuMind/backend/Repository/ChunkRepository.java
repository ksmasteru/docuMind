package com.docuMind.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

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
    }

void deleteByFileId(String id);
    
}
