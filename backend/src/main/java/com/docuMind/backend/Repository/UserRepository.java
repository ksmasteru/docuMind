package com.docuMind.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.User;


@Repository
public interface UserRepository extends JpaRepository<User, String> {
    
    Optional <User> findByEmail(String email);

    Optional<User> findByName(String name);

    void deleteByEmail(String email);
}