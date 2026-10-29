package com.docuMind.backend.security;

import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface LoginLinkRepository extends JpaRepository<LoginLink, Long> {

    // the user comes with it: signing in needs their email and role right away
    @EntityGraph(attributePaths = "user")
    Optional<LoginLink> findByTokenHash(String tokenHash);
}
