/*
Wire Everything Together (Security Configuration)Create 
your configuration class to link the filters, encode passwords via BCrypt,
 and protect/permit specific API routes */


package com.docuMind.backend.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.docuMind.backend.security.JwtAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                        // 1. Tell Spring Security to use the corsConfigurationSource bean defined below
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(AbstractHttpConfigurer::disable) // Disable CSRF since JWT is stateless
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/error").permitAll()              // Allow Tomcat's internal error dispatch
                .requestMatchers("/api/auth/**").permitAll()        // Allow registration/login endpoints
                .requestMatchers("/api/admin/**").hasRole("ADMIN")  // Strictly enforce ADMIN role
                .requestMatchers("/actuator/**").permitAll() // should be Admin
                .anyRequest().authenticated()                       // Protect everything else
            )
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS) // No HTTP sessions
            )
            // JwtAuthenticationFilter only sets the ThreadLocal SecurityContext; without this,
            // it isn't persisted anywhere, so streaming/async responses (e.g. AskController)
            // lose authentication on the async re-dispatch and get denied.
            .securityContext(securityContext -> securityContext.requireExplicitSave(false))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class); // Hook up JWT Filter

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        
        // Exact React origin (DO NOT use "*" if allowCredentials is true)
        configuration.setAllowedOrigins(List.of("http://localhost:5173")); 
        
        // Explicitly list all allowed HTTP methods
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        
        // Allow all standard headers (Authorization, Content-Type, etc.)
        configuration.setAllowedHeaders(List.of("*"));
        
        // Crucial for reading/writing tokens or session metadata
        configuration.setAllowCredentials(true); 

        // Apply this policy globally across all application paths
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
