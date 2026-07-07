package com.docuMind.backend.security;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.docuMind.backend.exception.SessionExpiredException;
import com.docuMind.backend.exception.UserNotFoundException;
import com.docuMind.backend.model.User;
import com.docuMind.backend.repository.UserRepository;

import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {
    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;
    
    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository,
        UserRepository userRepository)
    {
        this.refreshTokenRepository = refreshTokenRepository;
        this.userRepository = userRepository;
    }
    
    @Transactional
    public RefreshToken generateRefreshToken(String email)
    {
        User user = userRepository.findByEmail(email).
            orElseThrow(() -> new UserNotFoundException("user not found with email: " + email));
    
        // deleting the old token(it it exists) and issuing a new one.
        refreshTokenRepository.deleteByUser(user);
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setToken(UUID.randomUUID().toString()); // Secure UUID string
        refreshToken.setExpiryDate(Instant.now().plusMillis(7 * 24 * 60 * 60 * 1000)); // 7 days expiration
        refreshToken.setUser(user);
        return refreshTokenRepository.save(refreshToken);
    }
    
    @Transactional(readOnly = true)
    public Optional<RefreshToken> findByToken(String token) {
        return refreshTokenRepository.findByToken(token);
    }
 
    @Transactional(readOnly = true) // BECAUSE THIS CAN MAKE A WHOLE OPERATION FAILL
    public RefreshToken verifyExpiration(RefreshToken token) {
        if (token.getExpiryDate().isBefore(Instant.now()) || token.isRevoked()) {
            refreshTokenRepository.delete(token);
            throw new SessionExpiredException("Refresh token has expired. Please log in again.");
        }
        return token;
    }
}
