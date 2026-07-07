package com.docuMind.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.FileEntity;

@Repository
public  interface DocumentRepository extends JpaRepository<FileEntity, String>{
    List<FileEntity> findByContentType(String contentType);

    List<FileEntity> findByNameContainingIgnoreCase(String fileName);
    Optional <FileEntity> findById(String id);

    List<FileEntity> findByGeneratedNameContainingIgnoreCase(String fileName);

    List<FileEntity> findByContentContainingIgnoreCase(String keyword);

    List<FileEntity> findByUserId(String userId);
}