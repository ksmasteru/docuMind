package com.docuMind.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.LoginLinkRequest;
import com.docuMind.backend.model.LoginLinkResponse;
import com.docuMind.backend.security.LoginLinkService;
import com.docuMind.backend.security.LoginLinkService.CreatedLink;

import jakarta.validation.Valid;

// Managers hand technicians a link that signs them in without a password, e.g. to test the
// forms. The technician side is AuthController's POST /api/auth/link.
@RestController
@RequestMapping("/api/v1/login-links")
@PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
public class LoginLinkController {

    // the web app's address, the same setting CORS uses (FRONT_END_URL)
    @Value("${app.cors.frontend-url:}")
    private String frontendUrl;

    private final LoginLinkService loginLinkService;

    public LoginLinkController(LoginLinkService loginLinkService)
    {
        this.loginLinkService = loginLinkService;
    }

    // POST /api/v1/login-links  { email, days? }
    // 201 LoginLinkResponse; 404 unknown email; 400 not a technician, or days outside 1–30
    @PostMapping
    public ResponseEntity<LoginLinkResponse> create(@Valid @RequestBody LoginLinkRequest request,
        Authentication authentication)
    {
        CreatedLink created = loginLinkService.create(request.email(), request.days(), authentication.getName());
        String link = frontendUrl == null || frontendUrl.isBlank()
            ? null
            : frontendUrl.replaceAll("/+$", "") + "/t/" + created.token();
        LoginLinkResponse response = new LoginLinkResponse(created.link().getId(), request.email(),
            created.token(), link, created.link().getExpiresAt());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // DELETE /api/v1/login-links/{id}: the link stops working. Someone already signed in with
    // it stays signed in until their session ends (refresh token, 7 days at most).
    // 204; 400 unknown id
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> revoke(@PathVariable Long id)
    {
        loginLinkService.revoke(id);
        return ResponseEntity.noContent().build();
    }
}
