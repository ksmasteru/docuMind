package com.docuMind.backend.controller;

import com.docuMind.backend.security.JwtService;
import com.docuMind.backend.services.UserService;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import com.docuMind.backend.services.CustomUserDetailsService;
import org.springframework.web.bind.annotation.*;
import com.docuMind.backend.model.UpdateUserRequest;
import com.docuMind.backend.model.UserResponseWrapper;
import com.docuMind.backend.model.UserResponseWrapper.UserInfo;
import com.docuMind.backend.model.User;

import java.util.List;

//import java.awt.List; !!!!!!!!! ???
import java.util.Map;

@RestController
@RequestMapping("/api/auth") /*the public api used for login in / register */
public class AuthController {

    private final UserService userService;
    private final AuthenticationManager authenticationManager;
    private final CustomUserDetailsService userDetailsService;
    private final JwtService jwtService;

    // Single constructor injection handles all dependencies smoothly
    public AuthController(
            UserService userService, 
            AuthenticationManager authenticationManager, 
            CustomUserDetailsService userDetailsService, 
            JwtService jwtService
    ) {
        this.userService = userService;
        this.authenticationManager = authenticationManager;
        this.userDetailsService = userDetailsService;
        this.jwtService = jwtService;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody UpdateUserRequest request) {
        try {
            User toRegister = new User(request.getName(), request.getEmail(),
                    request.getPassword(), request.getRole());
            User registered = userService.registerUser(toRegister);
            List<UserInfo> userInfo = List.of(new UserInfo(registered.getName(), registered.getEmail(), registered.getRole()));
            UserResponseWrapper response = new UserResponseWrapper(userInfo, userInfo.size());
            return ResponseEntity.status(HttpStatus.OK)
                    .body(response);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

        @PostMapping("/login")
        public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        try {
            // Step A: Bouncer validation step
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.get("email"), request.get("password"))
            );

            // Step B: Credentials match! Fetch context data from MongoDB
            final UserDetails userDetails = userDetailsService.loadUserByUsername(request.get("email"));
            // here the role is returned by the user detailsservice
            // Step C: Construct the secure token payload
            final String jwtToken = jwtService.generateToken(userDetails);

            // Step D: Safely return only the generated pass token
            return ResponseEntity.ok(Map.of("token", jwtToken));

        } catch (BadCredentialsException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                 .body(Map.of("error", "Invalid email or password"));
        }
    }
}