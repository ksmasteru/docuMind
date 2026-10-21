package com.docuMind.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.ImageEntity;

@Repository
public interface ImageEntityRepository extends JpaRepository<ImageEntity, String>{
    // every photo attached to one report
    List<ImageEntity> findByReportId(String reportId);

    List<ImageEntity> findByUploadedBy(String uploadedBy);
}
