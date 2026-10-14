package com.docuMind.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

import com.docuMind.backend.model.CheckListTemplate;

@Repository
public interface CheckListTemplateRepository extends JpaRepository<CheckListTemplate,String>
{
    Optional<CheckListTemplate> findByTitle(String title);
    boolean existsByTitleAndActiveTrue(String title);
    Optional<CheckListTemplate> findTopByTitleOrderByVersionDesc(String title);
    List<CheckListTemplate> findByActiveTrue();
}
