package com.docuMind.backend.model;
import com.docuMind.backend.model.enums.UserRole;

public class UserResponse {
    private String id;
    private String name;
    private String email;
    private UserRole role;
    
    public UserResponse(User user)
    {
        this.id = user.getId();
        this.name = user.getName();
        this.email = user.getEmail();
        this.role = user.getRole();
    }

    public String getId()
    {
        return this.id;
    }

    public String getName()
    {
        return this.name;
    }

    public String getEmail()
    {
        return this.email;
    }

    public UserRole getRole()
    {
        return this.role;
    }
}