package com.docuMind.backend.controller;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.exception.SessionExpiredException;
import com.docuMind.backend.model.AuthResponse;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.UserResponseWrapper;
import com.docuMind.backend.model.UserResponseWrapper.UserInfo;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.security.JwtService;
import com.docuMind.backend.security.RefreshToken;
import com.docuMind.backend.security.RefreshTokenRepository;
import com.docuMind.backend.security.RefreshTokenService;
import com.docuMind.backend.services.CustomUserDetailsService;
import com.docuMind.backend.services.UserService;

@RestController
@RequestMapping("/api/auth") /*the public api used for login in / register */
public class AuthController {
    @Value("${app.security.admin-key}")
    private String adminSecretKey;

    private final RefreshTokenRepository refreshTokenRepository;
    private final UserService userService;
    private final AuthenticationManager authenticationManager;
    private final CustomUserDetailsService userDetailsService;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    // Single constructor injection handles all dependencies smoothly
    public AuthController(
            UserService userService, 
            AuthenticationManager authenticationManager, 
            CustomUserDetailsService userDetailsService, 
            JwtService jwtService,
            RefreshTokenService refreshTokenService, RefreshTokenRepository refreshTokenRepository
    ) {
        this.userService = userService;
        this.authenticationManager = authenticationManager;
        this.userDetailsService = userDetailsService;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.refreshTokenRepository = refreshTokenRepository;
    }

    @Transactional     
    @PostMapping("/register-admin")
    public ResponseEntity<?> register_admin(@RequestBody Map<String, String> request)
    {    
        if (request.get("admin_key") == null || request.get("admin_key").isEmpty())
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid key");
        String providedKey = request.get("admin_key");
        if (!adminSecretKey.equals(providedKey)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized token.");
        }
        try {
            User toRegister = new User(request.get("name"), request.get("email"),
            request.get("password"), UserRole.ADMIN);
            User registered = userService.registerUser(toRegister);
            List<UserInfo> userInfo = List.of(new UserInfo(registered.getName(), registered.getEmail(), registered.getRole()));
            UserResponseWrapper response = new UserResponseWrapper(userInfo, userInfo.size());
            return ResponseEntity.status(HttpStatus.OK)
            .body(response);
        }
        catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
 
    @Transactional
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody  Map<String, String> request) {
        
        System.out.println("received a new register request with body :" + request);
        
        try {
            User toRegister = new User(request.get("name"), request.get("email"),
                    request.get("password"), UserRole.USER);
            User registered = userService.registerUser(toRegister);
            List<UserInfo> userInfo = List.of(new UserInfo(registered.getName(), registered.getEmail(), registered.getRole()));
            UserResponseWrapper response = new UserResponseWrapper(userInfo, userInfo.size());
            return ResponseEntity.status(HttpStatus.OK)
                    .body(response);
        }
        catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

        @Transactional
        @PostMapping("/login")
        public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
       
            System.out.println("new login request with " + request.get("email") + " password " + request.get("password"));
            try {
            // Step A: Bouncer validation step
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.get("email"), request.get("password"))
            );

            // Step B: Credentials match! Fetch context data from MongoDB
            final UserDetails userDetails = userDetailsService.loadUserByUsername(request.get("email"));
            // here the role is returned by the user detailsservice
            // generate refresh token. 
            RefreshToken refreshTokenObj = refreshTokenService.generateRefreshToken(request.get("email"));
            String refreshToken = refreshTokenObj.getToken();
            // Step C: Construct the secure token payload
            final String accessToken = jwtService.generateToken(userDetails);
            User user = refreshTokenObj.getUser();
            return ResponseEntity.ok(new AuthResponse(accessToken, refreshToken, "Bearer", user.getRole()));

        } catch (BadCredentialsException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                 .body(Map.of("error", "Invalid email or password"));
        }
    }

    // sends refreshtoken.,
    @Transactional
    @PostMapping("/refresh")
    public ResponseEntity<?> refreshSession(@RequestBody Map<String, String> request) {
        String clientRefreshToken = request.get("refreshToken");

        if (clientRefreshToken == null || clientRefreshToken.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Missing refresh token");
        }
        // 1. Fetch token from MongoDB
        Optional<RefreshToken> refreshTokenObj = refreshTokenService.findByToken(clientRefreshToken);
        if (!refreshTokenObj.isPresent()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid token");
        }
        RefreshToken tokenEntity = refreshTokenObj.get();
    
        // 2. Validate token expiration safely
        try {
            refreshTokenService.verifyExpiration(tokenEntity);
        } catch (SessionExpiredException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ex.getMessage());
        }
    
        // 3. Get the linked User from the token document (Removes the need to pass email from frontend)
        User user = tokenEntity.getUser(); 
        
        // 4. Load UserDetails securely using database parameters
        final UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
    
        // 5. Generate a fresh access token
        final String newAccessToken = jwtService.generateToken(userDetails);
    
        // Return the new access token along with the existing refresh token
        return ResponseEntity.ok(new AuthResponse(newAccessToken, tokenEntity.getToken(), "Bearer", user.getRole()));
    }

    @Transactional
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestBody Map<String, String> request)
    {
        String clientRefreshToken = request.get("refreshToken");

        if (clientRefreshToken == null || clientRefreshToken.isEmpty())
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("empty refresh token");
        
        Optional<RefreshToken> token = refreshTokenService.findByToken(clientRefreshToken);
        
        if (!token.isPresent()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid token");
        }
        
        RefreshToken tokenEntity = token.get();
    
        // 2. Validate token expiration safely
        try {
            refreshTokenService.verifyExpiration(tokenEntity);
        }
        catch (SessionExpiredException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ex.getMessage());
        }
        
        tokenEntity.setRevoked(true);
        
        refreshTokenRepository.save(tokenEntity);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body("Logged Out successfully");
    }
}