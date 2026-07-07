package com.docuMind.backend.repository;


import com.docuMind.backend.model.FileContent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface FileContentRepository extends JpaRepository<FileContent, String>{
    Optional<FileContent> findById(String id);
}