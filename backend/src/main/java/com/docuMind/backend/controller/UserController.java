package com.docuMind.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.UpdateUserRequest;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.UserResponseWrapper;
import com.docuMind.backend.model.UserResponseWrapper.UserInfo;
import com.docuMind.backend.services.UserService;

import jakarta.validation.Valid;


@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    // 1. GET ALL USERS: GET /api/v1/users
    @GetMapping
    public UserResponseWrapper getUsers() {
        System.out.println("received a new request for get users");
        List<User> users = userService.getAllUsers();
        List<UserInfo> userInfo = users.stream()
                .map(user -> new UserInfo(user.getName(), user.getEmail(), user.getRole()))
                .toList();
        return new UserResponseWrapper(userInfo, userInfo.size());
    }
    
    // 2. GET ONE USER: GET /api/v1/users/{id}
    @GetMapping("/{id}")
    public ResponseEntity<UserResponseWrapper> getUser(@PathVariable String id) {
        User user = userService.getUserById(id);
        List<UserInfo> user_info = List.of(new UserInfo(user.getName(), user.getEmail(), user.getRole()));
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        return ResponseEntity.ok(response);
    }

    // 3. REGISTER: POST /api/v1/users (or keep "/register" if preferred for auth symmetry)
    @PostMapping
    public ResponseEntity<UserResponseWrapper> addNewUser(@Valid @RequestBody UpdateUserRequest user) {
        User newUser = new User(user.getName(), user.getEmail(), user.getPassword(), user.getRole());
        User savedUser = userService.registerUser(newUser);
        
        List<UserInfo> user_info = List.of(new UserInfo(savedUser.getName(), savedUser.getEmail(), savedUser.getRole()));
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 4. UPDATE USER: PUT /api/v1/users/{id}
    @PutMapping("/{id}")
    public ResponseEntity<UserResponseWrapper> updateUser(
            @PathVariable String id, 
            @Valid @RequestBody UpdateUserRequest updateUserRequest) { // Added missing @RequestBody
        
        User user = userService.updateUser(id, updateUserRequest);
        List<UserInfo> user_info = List.of(new UserInfo(user.getName(), user.getEmail(), user.getRole()));
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        
        return ResponseEntity.ok(response);
    }
    
    // 5. DELETE USER: DELETE /api/v1/users/{id}
    // Use Spring Security annotations like @PreAuthorize("hasRole('ADMIN')") here to restrict access instead of changing the URL path
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    
    public ResponseEntity<Void> deleteUser(@PathVariable String id) {
        System.out.println("received a delelete request");
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

}