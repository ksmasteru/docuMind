package com.docuMind.backend.model;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// body of POST /api/v1/team/technicians: a manager creates a technician account, which joins his team.
// The name is asked in two parts and the site is required: it is the name his reports are signed with,
// and the site decides which alerts he sees
public record TeamTechnicianForm(
    @NotBlank(message = "Le prénom est obligatoire.")
    @Size(max = 80, message = "Le prénom est trop long.")
    String firstName,
    @NotBlank(message = "Le nom est obligatoire.")
    @Size(max = 80, message = "Le nom est trop long.")
    String lastName,
    @NotBlank(message = "Le site est obligatoire.")
    String worksite, // Jorf, Safi…
    @NotBlank(message = "L'e-mail est obligatoire.")
    @Email(message = "Cet e-mail n'est pas valide.")
    String email,
    @NotBlank(message = "Le mot de passe est obligatoire.")
    @Size(min = 8, max = 100, message = "Le mot de passe doit faire au moins 8 caractères.")
    String password
)
{
    // hide the password when the request is logged
    @Override
    public String toString()
    {
        return "TeamTechnicianForm[firstName=" + firstName + ", lastName=" + lastName + ", email=" + email
            + ", worksite=" + worksite + ", password=****]";
    }

    // PUT /api/v1/team/technicians/{id}/account: his manager corrects his name or his site
    public record Correction(
        @NotBlank(message = "Le prénom est obligatoire.")
        @Size(max = 80, message = "Le prénom est trop long.")
        String firstName,
        @NotBlank(message = "Le nom est obligatoire.")
        @Size(max = 80, message = "Le nom est trop long.")
        String lastName,
        @NotBlank(message = "Le site est obligatoire.")
        String worksite) {}

    // POST /api/v1/team/technicians/{id}/password: his manager gives him a new password
    public record NewPassword(
        @NotBlank(message = "Le mot de passe est obligatoire.")
        @Size(min = 8, max = 100, message = "Le mot de passe doit faire au moins 8 caractères.")
        String password)
    {
        @Override
        public String toString() { return "NewPassword[password=****]"; }
    }
}
