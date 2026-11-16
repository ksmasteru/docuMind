package com.docuMind.backend.model;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import com.docuMind.backend.model.enums.UserRole;

@Entity
@Table(name = "users")
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    // the site the user works on
    @Column
    private String worksite;

    // name is what is shown and signed ("Prénom Nom"). The accounts a manager creates also keep the
    // two parts; older accounts have the name only
    @Column
    private String firstName;

    @Column
    private String lastName;

    // who set the current password and when: the user himself (his own e-mail), or the manager or
    // admin who created the account or reset it. null for the passwords set before this was kept
    @Column
    private String passwordSetBy;

    @Column
    private Instant passwordSetAt;

    @ManyToOne(fetch= FetchType.LAZY)
    @JoinColumn(name = "manager_id")
    private User manager;

    public User() {}

    public User(String name, String email, String password, UserRole role) {
        this.name = name;
        this.email = email;
        this.password = password;
        this.role = role;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + this.role.name()));
    }

    @Override public String getUsername()              { return this.email; }
    @Override public boolean isAccountNonExpired()     { return true; }
    @Override public boolean isAccountNonLocked()      { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled()               { return true; }

    public String getId()       { return id; }
    public void setId(String id){ this.id = id; }
    public String getName()     { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail()    { return email; }
    public void setEmail(String email) { this.email = email; }
    @Override
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public UserRole getRole()   { return role; }
    public void setRole(UserRole role) {
        this.role = (role == null) ? UserRole.USER : role;
    }
    public String getWorksite() { return worksite; }
    public void setWorksite(String worksite) { this.worksite = worksite; }
    public String getFirstName() { return firstName; }
    public String getLastName()  { return lastName; }
    public String getPasswordSetBy()  { return passwordSetBy; }
    public Instant getPasswordSetAt() { return passwordSetAt; }

    // "Prénom Nom", which becomes the name shown and signed
    public void setNames(String firstName, String lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.name = firstName + " " + lastName;
    }

    // hash: already encoded; by: the e-mail of who set it
    public void setPassword(String hash, String by, Instant at) {
        this.password = hash;
        this.passwordSetBy = by;
        this.passwordSetAt = at;
    }
}