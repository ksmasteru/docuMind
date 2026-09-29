package com.docuMind.backend.repository;

import java.util.List;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.AskInteraction;

@Repository
public interface AskInteractionRepository extends JpaRepository<AskInteraction, String>{
    Optional <AskInteraction> findById(String id);
}