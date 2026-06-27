package com.docuMind.backend.security;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import com.docuMind.backend.model.User;

@Repository
public interface RefreshTokenRepository extends MongoRepository<RefreshToken, String>{
    Optional<RefreshToken> findByToken(String token);

    Optional<RefreshToken> findById(String Id);

    void deleteByUser(User user);
}
