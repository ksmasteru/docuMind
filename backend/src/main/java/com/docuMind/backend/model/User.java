package com.docuMind.backend.model;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import com.docuMind.backend.model.enums.UserRole;

@Entity
@Table(name = "`user`")
public class User{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    
    @Column(nullable = false, length = 100)
    public String name;
    
    @Column(nullable = false, unique = true)
    public String email;
    
    @Column(nullable = false, length = 100)
    public String password;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable=false)
    private UserRole role;
    
    public User(){}
    public User(String name, String email, String password, UserRole role)
    {
        this.name = name;
        this.email = email;
        this.password = password;
        this.role = role;
    }
    
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email;}
    
    public String getPassword() { return this.password;}
    public void setPassword(String password) {this.password = password;}

    public void setRole(UserRole role) { this.role = role;}
    public UserRole getRole() { return this.role;}
}
