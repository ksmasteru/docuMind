package com.docuMind.backend.model;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

// body of POST /api/auth/register_manager (admin only)
public record ManagerRegisterForm(
    String id,

    @NotBlank(message = "name must not be blank")
    String name,

    @NotBlank(message = "email must not be blank")
    @Email(message = "email must be valid")
    String email,

    @NotBlank(message = "password must not be blank")
    String password
)
{
    // hide the password when the request is logged
    @Override
    public String toString()
    {
        return "ManagerRegisterForm[id=" + id + ", name=" + name + ", email=" + email + ", password=****]";
    }
}
