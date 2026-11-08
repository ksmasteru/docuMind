package com.docuMind.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.Quote;
import com.docuMind.backend.model.enums.QuoteStatus;

// quotes are never deleted : a replaced one is CANCELED.
@Repository
public interface QuoteRepository extends JpaRepository<Quote, String>
{
    // an intervention's quotes, the newest version first. Uses idx_quote_intervention
    List<Quote> findByInterventionIdOrderByVersionDesc(String interventionId);

    // the latest version, for the next version's number
    Optional<Quote> findFirstByInterventionIdOrderByVersionDesc(String interventionId);

    // the draft being prepared, if any: "Générer le devis" opens it again instead of making a second one
    Optional<Quote> findFirstByInterventionIdAndStatus(String interventionId, QuoteStatus status);
}
