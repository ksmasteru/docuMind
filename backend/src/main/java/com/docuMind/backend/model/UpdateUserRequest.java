package com.docuMind.backend.model;

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
    public UpdateUserRequest(String name, String email, String password) {
        this.name = name;
        this.email = email;
        this.password = password;
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
}