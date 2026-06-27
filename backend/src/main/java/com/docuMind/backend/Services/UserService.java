package com.docuMind.backend.services;

import java.util.List;
import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.docuMind.backend.exception.UserNotFoundException;
import com.docuMind.backend.model.UpdateUserRequest;
import com.docuMind.backend.model.User;
import com.docuMind.backend.repository.UserRepository;


@Service
public class UserService {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    String red = "\u001B[31m";
    String reset = "\u001B[0m";
    
    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    // Business Action: Register a new user but check for duplicates first
    public User registerUser(User user) {
        // Business Rule: Check if email is already taken
        boolean emailExists = userRepository.findByEmail(user.getEmail()).isPresent();
        if (emailExists) {
            throw new IllegalArgumentException("Email is already registered!");
        }
        // Save and return the fresh user record
        // we should have the pasword before registering the user.
        String encryptedPassword = passwordEncoder.encode(user.getPassword());
        user.setPassword(encryptedPassword);
        return userRepository.save(user);
    }

    public User updateUser(String id, UpdateUserRequest requestedUser)
    {
        User user = userRepository.findById(id)
                .orElseThrow(() ->
                    new UserNotFoundException("User not found"));

        Optional<User> existingUser = userRepository.findByEmail(requestedUser.getEmail());

        if (existingUser.isPresent()
                && !existingUser.get().getId().equals(id))
        {
            throw new IllegalArgumentException(
                    "Email is already registered");
        }

        user.setEmail(requestedUser.getEmail());
        return userRepository.save(user);
    }

    public User getUserById(String id)
    {
        return userRepository.findById(id)
                .orElseThrow( () -> new UserNotFoundException("User not found with id : " + id));
    }
    // Business Action: Find a user by email, or throw a clean error if missing
    public User getUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new UserNotFoundException("User not found with email: " + email));
    }

    public User getUserByName(String name)
    {
        return userRepository.findByName(name)
                .orElseThrow(() -> new UserNotFoundException("User not found with name : " + name));
    }

    // Business Action: Get everyone in the database
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    // to fix : should throw an exceptionn i user doesnt exist
    public void deleteUser(String id)
    {
        // busines logic : check if user exists
        boolean userExists = userRepository.findById(id).isPresent();
        if (userExists)
            userRepository.deleteById(id);
        else
            throw new UserNotFoundException("User not found");
    }
}