package com.docuMind.backend.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.exception.InvalidLoginLinkException;
import com.docuMind.backend.exception.InvalidRoleException;
import com.docuMind.backend.exception.UserNotFoundException;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.UserRepository;

// Login links: a manager makes one for a technician, the technician opens it and is signed in
// (AuthController /link). Only technicians get links, so a leaked link never opens a manager's
// or an admin's account.
@Service
public class LoginLinkService {

    // 7 days unless asked otherwise; capped so a forgotten test link doesn't live forever
    public static final int DEFAULT_DAYS = 7;
    public static final int MAX_DAYS = 30;

    // 32 random bytes = 256 bits: guessing one is out of reach, no rate limit needed
    private static final int TOKEN_BYTES = 32;

    private final SecureRandom random = new SecureRandom();
    private final LoginLinkRepository loginLinkRepository;
    private final UserRepository userRepository;

    public LoginLinkService(LoginLinkRepository loginLinkRepository, UserRepository userRepository)
    {
        this.loginLinkRepository = loginLinkRepository;
        this.userRepository = userRepository;
    }

    // what a new link hands back: the token is in here and nowhere else
    public record CreatedLink(LoginLink link, String token) {}

    @Transactional
    public CreatedLink create(String technicianEmail, Integer days, String createdBy)
    {
        int validDays = days == null ? DEFAULT_DAYS : days;
        if (validDays < 1 || validDays > MAX_DAYS)
            throw new IllegalArgumentException("days must be between 1 and " + MAX_DAYS);

        User technician = userRepository.findByEmail(technicianEmail)
            .orElseThrow(() -> new UserNotFoundException("user not found with email: " + technicianEmail));
        if (technician.getRole() != UserRole.USER)
            throw new InvalidRoleException("login links are only for technicians");

        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        // URL-safe, no padding: it goes straight into the link's path
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        Instant now = Instant.now();
        LoginLink link = new LoginLink();
        link.setTokenHash(hash(token));
        link.setUser(technician);
        link.setCreatedBy(createdBy);
        link.setCreatedAt(now);
        link.setExpiresAt(now.plus(Duration.ofDays(validDays)));
        return new CreatedLink(loginLinkRepository.save(link), token);
    }

    // The technician the link signs in as. Refuses a link that is unknown, expired, revoked,
    // or whose account stopped being a technician's since the link was made.
    @Transactional
    public User signIn(String token)
    {
        if (token == null || token.isBlank())
            throw new InvalidLoginLinkException("missing login link");

        LoginLink link = loginLinkRepository.findByTokenHash(hash(token.strip()))
            .orElseThrow(() -> new InvalidLoginLinkException("unknown login link"));
        if (link.isRevoked() || link.getExpiresAt().isBefore(Instant.now()))
            throw new InvalidLoginLinkException("this login link has expired");
        User technician = link.getUser();
        if (technician.getRole() != UserRole.USER)
            throw new InvalidLoginLinkException("this login link has expired");

        link.setLastUsedAt(Instant.now());
        return technician;
    }

    @Transactional
    public void revoke(Long id)
    {
        LoginLink link = loginLinkRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("no login link with id " + id));
        link.setRevoked(true);
    }

    private static String hash(String token)
    {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        }
        catch (NoSuchAlgorithmException ex) {
            // every JVM ships SHA-256
            throw new IllegalStateException(ex);
        }
    }
}
