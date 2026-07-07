package com.docuMind.backend.security;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.User;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long>{
    Optional<RefreshToken> findByToken(String token);

    Optional<RefreshToken> findById(Long Id);

    void deleteByUser(User user);
    // deleteByExpiryDateBeforeAndRevokedTrue(Instant cutoff);
}
