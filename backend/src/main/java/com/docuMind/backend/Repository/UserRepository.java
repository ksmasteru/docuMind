package com.docuMind.backend.repository;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.User;

@Repository
public interface UserRepository extends MongoRepository<User, String>
{
    Optional <User> findByEmail(String email);
    // naming convention should be respected.
    // automatically generates : SELECT * FROM users WHERE email = ?

    Optional<User> findByName(String name);

}