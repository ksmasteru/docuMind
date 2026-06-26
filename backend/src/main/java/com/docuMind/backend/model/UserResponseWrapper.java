package com.docuMind.backend.model;

import java.util.List;
import com.docuMind.backend.model.enums.UserRole;

public record  UserResponseWrapper(
    List<UserInfo> users,
    int userCount 
) {
    public record UserInfo(
        String name, String userId, UserRole role
    )
    {

    }
}
