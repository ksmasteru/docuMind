package com.docuMind.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.Team;

@Repository
public interface TeamRepository extends JpaRepository<Team, String>
{
    // the manager's own team (the token holds his email)
    Optional<Team> findByManager_Email(String managerEmail);

    // the team a technician is in, if any (he is in one at most)
    @Query("select t from Team t join t.technicians m where m.id = :technicianId")
    Optional<Team> findByTechnicianId(@Param("technicianId") String technicianId);

    // every technician already in a team: the others can be added
    @Query("select m.id from Team t join t.technicians m")
    List<String> findAllMemberIds();

    // is this technician in this manager's team? (his history, his reports: SubmissionService.canRead)
    @Query("""
        select case when count(t) > 0 then true else false end
        from Team t join t.technicians m
        where t.manager.email = :managerEmail and m.email = :technicianEmail""")
    boolean isInTeam(@Param("managerEmail") String managerEmail, @Param("technicianEmail") String technicianEmail);
}
