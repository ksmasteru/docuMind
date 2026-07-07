package com.docuMind.backend.security;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;

@Component
public class RefreshTokenCleanupJob {

    private final RefreshTokenRepository repository;

    public RefreshTokenCleanupJob(RefreshTokenRepository repository) {
        this.repository = repository;
    }

    // Runs every hour. Deletes tokens that are both expired AND revoked —
    // keeping recently-expired-but-not-revoked tokens briefly is harmless
    // since verifyExpiration() rejects them on use anyway, but it means
    // you can still inspect them for debugging if needed.
    // Change to deleteByExpiryDateBefore(Instant.now()) if you want
    // aggressive cleanup regardless of revoked status.
    @Scheduled(fixedRate = 3_600_000)
    @Transactional
    public void deleteExpiredTokens() {
        repository.deleteByExpiryDateBeforeAndRevokedTrue(Instant.now());
    }
}