package com.docuMind.backend.repository;

import com.docuMind.backend.model.FileEntity;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

public  interface DocumentRepository extends MongoRepository<FileEntity, String>{
    List<FileEntity> findByContentType(String contentType);

    List<FileEntity> findByNameContainingIgnoreCase(String fileName);
    Optional <FileEntity> findById(String id);
}