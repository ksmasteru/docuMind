package com.docuMind.backend.model;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// body of POST /api/v1/team/technicians: a manager creates a technician account, which joins his team
public record TeamTechnicianForm(
    @NotBlank(message = "Le nom est obligatoire.")
    String name,
    @NotBlank(message = "L'e-mail est obligatoire.")
    @Email(message = "Cet e-mail n'est pas valide.")
    String email,
    @NotBlank(message = "Le mot de passe est obligatoire.")
    @Size(min = 6, message = "Le mot de passe doit faire au moins 6 caractères.")
    String password,
    String worksite // optional: Jorf, Safi…
)
{
    // hide the password when the request is logged
    @Override
    public String toString()
    {
        return "TeamTechnicianForm[name=" + name + ", email=" + email + ", worksite=" + worksite + ", password=****]";
    }
}
