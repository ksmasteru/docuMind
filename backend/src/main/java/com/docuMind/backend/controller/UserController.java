package com.docuMind.backend.controller;

import java.awt.desktop.UserSessionListener;
import java.util.ArrayList;
import java.util.List;

import org.apache.catalina.connector.Response;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.User;
import com.docuMind.backend.model.UserResponse;
import com.docuMind.backend.repository.UserRepository;
import com.docuMind.backend.services.UserService;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;

import com.docuMind.backend.model.UpdateUserRequest;

import jakarta.validation.Valid;


@RestController
@RequestMapping("/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService)
    {
        this.userService = userService;
    }

    @GetMapping("/")
    public List <UserResponse> getUsers()
    {
        List<User> users = userService.getAllUsers();
        List<UserResponse> userResponses = new ArrayList<>();
        for (User user : users)
            userResponses.add(new UserResponse(user));
        return userResponses;
    }
    
    @GetMapping("/id/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable Long id)
    {
        User user = userService.getUserById(id);
        return ResponseEntity.status(HttpStatus.OK)
            .body(new UserResponse(user));
    }

    @PostMapping("/")
    public ResponseEntity<UserResponse> addNewUser(@Valid @RequestBody UpdateUserRequest user) {
        User newUser = new User(user.getName(), user.getEmail(), user.getPassword(), user.getRole());
        User SavedUser = userService.registerUser(newUser);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new UserResponse(SavedUser));
    }

    // user wants to change email
    @PutMapping("/id/{id}")
    public ResponseEntity<UserResponse> updateUser(@PathVariable Long id, @Valid UpdateUserRequest UpdateUserRequest)
    {
        // bro stop getting dostracted .
        User user = userService.updateUser(id, UpdateUserRequest);
        return ResponseEntity.status(HttpStatus.OK) 
            .body(new UserResponse(user));
    }
    
    @DeleteMapping("/id/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id)
    {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }
}