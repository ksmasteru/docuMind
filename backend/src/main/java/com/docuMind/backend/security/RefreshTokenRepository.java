package com.docuMind.backend.security;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import com.docuMind.backend.model.User;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long>{
    Optional<RefreshToken> findByToken(String token);

    Optional<RefreshToken> findById(Long Id);

    void deleteByUser(User user);
    void deleteByExpiryDateBeforeAndRevokedTrue(Instant cutoff);
}
