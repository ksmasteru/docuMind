/*
* Generates the token after login and verify tokens of requests
 */
package com.docuMind.backend.security;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

import javax.crypto.SecretKey;

import com.docuMind.backend.exception.SessionExpiredException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

@Component
public class JwtService {

    String red = "\u001B[31m";
    String green = "\u001B[32m";
    String reset = "\u001B[0m";
    
    @Value("${app.jwt.secret}")
    private String secretKey;

    @Value("${app.jwt.expiration}")
    private long jwtExpiration;

    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    // 1. Generate Token
    public String generateToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();

        // convertnin commplexes authority object
        String cleanRole = userDetails.getAuthorities().stream()
                .findFirst()
                .map(grantedAuth -> grantedAuth.getAuthority())
                .orElse("ROLE_USER");
        claims.put("role", cleanRole); // Inject user roles into payload
        
        return Jwts.builder()
                .claims(claims)
                .subject(userDetails.getUsername()) // This will be the email address
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + jwtExpiration))
                .signWith(getSigningKey())
                .compact();
    }

    // 2. Extract Username from Token
    public String extractUsername(String token) {
        String Username = null;
        try {
            Username = extractClaim(token, Claims::getSubject);
        }
        catch (ExpiredJwtException ex)
        {
            System.out.println(green + ex.getMessage() + reset);
            throw new SessionExpiredException("Session expired please Log in") ;
        }
        return Username;
    }

    public boolean isTokenValid(String token) {
        try {
            // This will throw an exception automatically if the signature is invalid or expired
            return !isTokenExpired(token);
        } 
        catch (ExpiredJwtException ex)
        {
            System.out.println(red + ex.getMessage() + reset);
            throw new SessionExpiredException("Session expired please Log in") ;
        }
        catch (Exception e) {
            return false; // Token is tampered with, malformed, or expired
        }
    }
    
    private boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }
    
    private Date extractExpiration(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getExpiration();
    }
    
    public String extractRole(String token) {
        String Role = null;
        try {
            Role = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .get("role", String.class); // Directly extracts your clean "ROLE_XXXX" string
        }
        catch (ExpiredJwtException ex)
        {
            System.out.println(red + ex.getMessage() + reset);
            throw new SessionExpiredException("Session expired please Log in") ;  
        }
        return Role;
    }

    private <T> T extractClaim(String token, Function<Claims, T> claimsResolver) throws ExpiredJwtException {

        final Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return claimsResolver.apply(claims);
    }
}
