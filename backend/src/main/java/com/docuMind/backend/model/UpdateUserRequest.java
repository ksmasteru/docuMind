package com.docuMind.backend.model;


import com.docuMind.backend.model.enums.UserRole;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
@Valid
public class UpdateUserRequest{
    @NotBlank(message = "name must not be blank")
    private String name;
    
    @NotBlank(message = "email must not be blank")
    @Email
    private String email;
    
    @NotBlank
    private String password;
    
    private UserRole role;
    
    public UpdateUserRequest(String name, String email, String password, UserRole role) {
        this.name = name;
        this.email = email;
        this.password = password;
        this.role = role;
    }

    public String getName()
    {
        return this.name;
    }

    public String getEmail()
    {
        return this.email;
    }

    public String getPassword()
    {
        return this.password;
    }

    public UserRole getRole()
    {
        return this.role;
    }
}