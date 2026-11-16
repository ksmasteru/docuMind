package com.docuMind.backend.controller;

import java.time.Instant;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.docuMind.backend.model.TechnicianResponseWrapper;
import com.docuMind.backend.model.TechnicianResponseWrapper.TechnicianInfo;
import com.docuMind.backend.model.UpdateUserRequest;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.UserResponseWrapper;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.model.UserResponseWrapper.UserInfo;
import com.docuMind.backend.services.UserService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;


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
    
    // we want better data ; on techincians sites, tasks assigned ?
    // so 
    @GetMapping("/technicians") // gets all users with role = user aka technician.
    public TechnicianResponseWrapper getTechnicians()
    {
        System.out.println("received a new request for get users");
        List<User> users = userService.getAllTechnicians();
        List<TechnicianInfo> technicianInfo = users.stream()
            .map(user -> new TechnicianInfo(user.getName(), user.getEmail(), user.getWorksite()))
            .toList();
        return new TechnicianResponseWrapper(technicianInfo, technicianInfo.size());
    }
    // 2. GET ONE USER: GET /api/v1/users/{id}
    @GetMapping("/{id}")
    public ResponseEntity<UserResponseWrapper> getUser(@PathVariable String id) {
        User user = userService.getUserById(id);
        List<UserInfo> user_info = List.of(new UserInfo(user.getName(), user.getEmail(), user.getRole()));
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        return ResponseEntity.ok(response);
    }

    // GET /api/v1/users/me: the caller's own account ("Mon compte")
    @GetMapping("/me")
    public ResponseEntity<Account> me(Authentication caller) {
        return ResponseEntity.ok(Account.of(userService.getUserByEmail(caller.getName())));
    }

    // POST /api/v1/users/me/password {currentPassword, newPassword}: he changes his own password.
    // 400 when the current one is wrong or the new one too short
    @PostMapping("/me/password")
    public ResponseEntity<Account> changeMyPassword(@Valid @RequestBody PasswordChange change, Authentication caller) {
        userService.changeOwnPassword(caller.getName(), change.currentPassword(), change.newPassword());
        return ResponseEntity.ok(Account.of(userService.getUserByEmail(caller.getName())));
    }

    public record PasswordChange(
        @NotBlank(message = "Le mot de passe actuel est obligatoire.")
        String currentPassword,
        @NotBlank(message = "Le nouveau mot de passe est obligatoire.")
        @Size(min = 8, max = 100, message = "Le nouveau mot de passe doit faire au moins 8 caractères.")
        String newPassword)
    {
        @Override
        public String toString() { return "PasswordChange[****]"; }
    }

    // passwordSetBySelf: he chose his password himself (false: a manager or an admin set it; null: not known)
    public record Account(String id, String name, String firstName, String lastName, String email, UserRole role,
                          String worksite, Boolean passwordSetBySelf, Instant passwordSetAt)
    {
        static Account of(User user) {
            return new Account(user.getId(), user.getName(), user.getFirstName(), user.getLastName(), user.getEmail(),
                user.getRole(), user.getWorksite(),
                user.getPasswordSetBy() == null ? null : user.getPasswordSetBy().equals(user.getEmail()),
                user.getPasswordSetAt());
        }
    }

    // 3. REGISTER: POST /api/v1/users (or keep "/register" if preferred for auth symmetry).
    // Admins only: technician accounts are created by their manager (TeamController), under the name
    // their reports are signed with
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<UserResponseWrapper> addNewUser(@Valid @RequestBody UpdateUserRequest user) {
        User newUser = new User(user.getName(), user.getEmail(), user.getPassword(), user.getRole());
        User savedUser = userService.registerUser(newUser);
        
        List<UserInfo> user_info = List.of(new UserInfo(savedUser.getName(), savedUser.getEmail(), savedUser.getRole()));
        UserResponseWrapper response = new UserResponseWrapper(user_info, user_info.size());
        
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 4. UPDATE USER: PUT /api/v1/users/{id}. Admins only: it changes the e-mail, which is the
    // identity a report is signed with
    @PreAuthorize("hasRole('ADMIN')")
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