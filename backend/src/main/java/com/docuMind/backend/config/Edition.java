package com.docuMind.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// Which platform this deployment is (plan_rapports_platform.md):
//   full      documind as a whole (the default)
//   rapports  the report platform PHOVA uses while the rest is built: reports, tasks, team, documents and
//             assistant only (EditionFilter hides the rest). A technician's report sent without a task goes
//             to his manager (OwnReportService), and a report needn't name an equipment.
// Set with APP_EDITION in .env; the web app reads the same choice from VITE_EDITION (init-server.sh writes it).
@Component
public class Edition {
    public static final String RAPPORTS = "rapports";

    private final boolean rapports;

    public Edition(@Value("${app.edition:full}") String edition)
    {
        this.rapports = RAPPORTS.equalsIgnoreCase(edition == null ? "" : edition.strip());
    }

    public boolean rapports()
    {
        return rapports;
    }
}
