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
import com.docuMind.backend.model.UserResponseWrapper;
import com.docuMind.backend.model.UserResponseWrapper.UserInfo;

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
    public UserResponseWrapper getUsers()
    {
        List<User> users = userService.getAllUsers();
        List<UserInfo> userInfo = users.stream().
                map(user -> new UserInfo(user.getName(), user.getId(), user.getRole())).
                toList();
        UserResponseWrapper response = new UserResponseWrapper(userInfo, userInfo.size());
        return response;
    }
    
    @GetMapping("/id/{id}")
    public ResponseEntity<UserResponseWrapper> getUser(@PathVariable Long id)
    {
        User user = userService.getUserById(id);
        List<UserInfo> user_info = List.of(new UserInfo(user.getName(), user.getId(), user.getRole()));
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        return ResponseEntity.status(HttpStatus.OK)
            .body(response);
    }

    @PostMapping("/")
    public ResponseEntity<UserResponseWrapper> addNewUser(@Valid @RequestBody UpdateUserRequest user) {
        User newUser = new User(user.getName(), user.getEmail(), user.getPassword(), user.getRole());
        
        User SavedUser = userService.registerUser(newUser);
        
        List<UserInfo> user_info = List.of(new UserInfo(SavedUser.getName(), SavedUser.getId(), SavedUser.getRole()));
        
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response);
    }

    // user wants to change email
    @PutMapping("/id/{id}")
    public ResponseEntity<UserResponseWrapper> updateUser(@PathVariable Long id, @Valid UpdateUserRequest UpdateUserRequest)
    {
        // bro stop getting dostracted .
        User user = userService.updateUser(id, UpdateUserRequest);
        
        List<UserInfo> user_info = List.of(new UserInfo(user.getName(), user.getId(), user.getRole()));
        
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        
        return ResponseEntity.status(HttpStatus.OK) 
            .body(response);
    }
    
    @DeleteMapping("/id/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id)
    {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }
}