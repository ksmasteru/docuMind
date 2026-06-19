package com.docuMind.backend.model;

public class UserResponse {
    private Long id;
    private String name;
    private String email;

    public UserResponse(User user)
    {
        this.id = user.getId();
        this.name = user.getName();
        this.email = user.getEmail();
    }


    public long getId()
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
}