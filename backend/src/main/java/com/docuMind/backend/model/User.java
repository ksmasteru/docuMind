package com.docuMind.backend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.security.core.GrantedAuthority;                // ADDED
import org.springframework.security.core.authority.SimpleGrantedAuthority; // ADDED
import org.springframework.security.core.userdetails.UserDetails;          // ADDED
import com.docuMind.backend.model.enums.UserRole;

import java.util.Collection;                                               // ADDED
import java.util.List;                                                     // ADDED

@Document(collection = "users")
public class User implements UserDetails { // <-- ADDED implementation
    
    @Id
    private String id;
    
    private String name;
    
    @Indexed(unique = true)
    private String email;
    
    private String password;
    
    private UserRole role;
    
    public User() {}
    
    public User(String name, String email, String password, UserRole role) {
        this.name = name;
        this.email = email;
        this.password = password;
        if (role == null)
            role = UserRole.USER;
        else
            this.role = role;
    }

    // =======================================================
    // REQUIRED SPRING SECURITY USERDETAILS METHODS
    // =======================================================

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // Formats your enum value into "ROLE_USER" or "ROLE_ADMIN"
        return List.of(new SimpleGrantedAuthority("ROLE_" + this.role.name()));
    }

    @Override
    public String getUsername() {
        // Tells Spring Security that you authenticate using the email field
        return this.email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true; // Keeps account valid forever
    }

    public boolean isAccountLocked() {
        return true; // Keeps account unlocked
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true; // Keeps credentials active
    }

    @Override
    public boolean isEnabled() {
        return true; // Keeps account enabled
    }

    // =======================================================
    // ORIGINAL GETTERS AND SETTERS
    // =======================================================

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    
    @Override
    public String getPassword() { return password; } // Fulfills UserDetails password contract
    public void setPassword(String password) { this.password = password; }
    public UserRole getRole() { return role; }
    public void setRole(UserRole role) { 
        if (role == null)
            this.role = UserRole.USER;
        else
        this.role = role;
    }
}
