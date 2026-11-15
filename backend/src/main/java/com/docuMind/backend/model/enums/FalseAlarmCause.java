package com.docuMind.backend.model.enums;

// why the alert was false
public enum FalseAlarmCause {
    PUMP_OK,                // everything normal on site
    SENSOR_FAULT,           // the sensor or its transmission is wrong: a fault of the instrument
    OPERATING_CONDITIONS    // a start-up, a test, a normal change of duty
}
