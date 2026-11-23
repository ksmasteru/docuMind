package com.docuMind.backend.config;

import java.io.IOException;
import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

// The report platform (Edition.rapports) answers 404 to the parts of documind it doesn't show, so a typed
// URL can't reach them either: the alerts and their checks on site, the workshop loop and its quotes, the
// pumps. The full platform lets everything through.
@Component
public class EditionFilter extends OncePerRequestFilter {
    // what the report platform hides; everything else stays (login, forms, reports, tasks, team, photos,
    // drafts, documents, assistant, login links, the QR codes' public check)
    static final List<String> HIDDEN = List.of(
        "/api/v1/alerts", "/api/v1/checks", "/api/v1/interventions", "/api/v1/quotes", "/api/v1/pumps");

    private final Edition edition;

    public EditionFilter(Edition edition)
    {
        this.edition = edition;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request)
    {
        return !edition.rapports();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException
    {
        if (hidden(request.getRequestURI().substring(request.getContextPath().length())))
        {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        chain.doFilter(request, response);
    }

    // "/api/v1/alerts" and what is under it, not "/api/v1/alertsX"
    static boolean hidden(String path)
    {
        return HIDDEN.stream().anyMatch(prefix -> path.equals(prefix) || path.startsWith(prefix + "/"));
    }
}
