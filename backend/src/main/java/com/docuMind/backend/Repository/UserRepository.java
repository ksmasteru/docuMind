package com.docuMind.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.User;


@Repository
public interface UserRepository extends JpaRepository<User, String> {
    
    Optional <User> findByEmail(String email);
    // the names behind a list of emails (who moved each task, in a technician's history)
    List<User> findByEmailIn(java.util.Collection<String> emails);

    Optional<User> findByName(String name);

    // every account of a role: the super admin's list of managers (ReportStatsService)
    List<User> findByRole(com.docuMind.backend.model.enums.UserRole role);

    void deleteByEmail(String email);

    @Query(value = "SELECT * FROM users WHERE role = 'USER'", nativeQuery = true)
    List<User> findAllTechnicians();
}