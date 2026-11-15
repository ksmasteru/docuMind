package com.docuMind.backend.model;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

// A manager's team: the technicians he follows on the Techniciens page (TeamService).
// One team per manager (unique manager_id), and a technician is in one team at most
// (unique technician_id in team_member). It is created the first time the manager adds someone.
@Entity
@Table(name = "team")
public class Team {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "manager_id", nullable = false, unique = true)
    private User manager;

    @ManyToMany
    @JoinTable(name = "team_member",
        joinColumns = @JoinColumn(name = "team_id"),
        inverseJoinColumns = @JoinColumn(name = "technician_id", unique = true))
    private Set<User> technicians = new HashSet<>();

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected Team() {} // for JPA

    public Team(User manager) {
        this.manager = manager;
    }

    public String getId()                { return id; }
    public User getManager()             { return manager; }
    public Set<User> getTechnicians()    { return technicians; }
    public Instant getCreatedAt()        { return createdAt; }

    // users are compared by id: User has no equals of its own
    public boolean hasTechnician(String userId) {
        return technicians.stream().anyMatch(user -> user.getId().equals(userId));
    }

    public void addTechnician(User technician) {
        if (!hasTechnician(technician.getId()))
            technicians.add(technician);
    }

    // false when he wasn't in the team
    public boolean removeTechnician(String userId) {
        return technicians.removeIf(user -> user.getId().equals(userId));
    }
}
