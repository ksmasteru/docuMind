package com.docuMind.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.ImageData;

// same id as ImageEntity, like FileContentRepository with FileEntity
@Repository
public interface ImageDataRepository extends JpaRepository<ImageData, String>{
}
