package com.docuMind.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.CheckPoint;

@Repository
public interface CheckPointRepository extends JpaRepository<CheckPoint, String>
{
    // a check task's points, in order
    List<CheckPoint> findByTaskIdOrderByPositionAsc(String taskId);
}
