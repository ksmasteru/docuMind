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
    WHERE user_id = :userId
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT :limit
    """, nativeQuery = true)
List<DocumentChunks> findSimilarChunks(
    @Param("userId") String userId,
    @Param("embedding") float[] embedding,
    @Param("limit") int limit
);
void deleteByFileId(String id);
}
