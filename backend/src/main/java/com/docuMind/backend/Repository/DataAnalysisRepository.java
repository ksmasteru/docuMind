package com.docuMind.backend.repository;

import com.docuMind.backend.model.DataAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface DataAnalysisRepository extends JpaRepository<DataAnalysis, String> {

    // Find analysis for a specific file
    Optional<DataAnalysis> findByFileId(String fileId);

    // Find all analyses for a user — for listing on the frontend
    List<DataAnalysis> findByUserIdOrderByCreatedAtDesc(String userId);

    // Check if analysis exists before creating a new one
    boolean existsByFileId(String fileId);

    // Delete when the file is deleted
    void deleteByFileId(String fileId);
}