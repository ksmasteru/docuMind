package com.docuMind.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.TextCopy;
import java.util.List;

@Repository
public interface TextRepository extends JpaRepository<TextCopy, Long>
{
    Optional <TextCopy> findById(Long Id);

    List<TextCopy> findByFileName(String name);
    
    List<TextCopy> findByContentContainingIgnoreCase(String keyword);
}
