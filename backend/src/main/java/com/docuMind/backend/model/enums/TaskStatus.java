package com.docuMind.backend.model.enums;

public enum TaskStatus {
    ASSIGNED,
    STARTED,
    BLOCKED,
    SUBMITTED, //report by technican
    DECLINED, // by technican : wrong alert ?
    CANCELED, // by maanger wrong task
    REJECTED, // INCOMPLETE TASK (reviewed by manager)
    RETURNED, // report needs corrections
    APPROVED // sumbitted by technician and aprroved by the manager
}
