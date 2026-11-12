/*  ChecklistTemplate        pont roulant, travail avec produits inflammables…
 ├─ id, title, type, version, active
 └─ ChecklistItem[]      order, label_fr, label_ar, critical, answerType
                         answerType: BON_MAUVAIS | OUI_NON_NA | NUMBER | TEXT | PHOTO

*/
package com.docuMind.backend.model;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import com.docuMind.backend.model.enums.ChecklistType;
import com.docuMind.backend.model.enums.FormLayout;
import com.docuMind.backend.model.enums.UserRole;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"title", "version"}))
public class CheckListTemplate{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    
    @Column(nullable=false)
    private String title;
    
    @Column(nullable=false)
    @Enumerated(EnumType.STRING)
    private ChecklistType checkListType;
    
    @Column(nullable=false)
    private int version;

    @Column(nullable = false)
    private boolean active = true;
 
    @Column(nullable = false)
    private String instructions;
    
    // how it's filled and printed; null for the forms made before it existed (told apart by title)
    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private FormLayout layout;

    // the paper sheet it replaces, printed in the PDF's header: "EN-PFD-MIC-01", "2.0", "29/03/2024"
    @Column(length = 64)
    private String paperReference;
    @Column(length = 16)
    private String paperEdition;
    @Column(length = 16)
    private String paperDate;

    // the roles that may fill it, "QUALITY" or "USER,MANAGER"; null = every role (the forms made before).
    // Checked by the backend: the form isn't listed, opened or accepted for anyone else
    @Column(length = 255)
    private String fillRoles;

    // the roles that may read every report sent with it, not only their own: "QUALITY,SALES"; null = none
    @Column(length = 255)
    private String readRoles;

    @OneToMany(mappedBy = "template",
                cascade = CascadeType.ALL,
                orphanRemoval = true)
    @OrderBy("position ASC")
    private List<CheckListItem> questions = new ArrayList<>(); 
    // had check item list is a collecttion li tab3a l had l form 

    public String getId()                       { return id; }
    public void setId(String id)                { this.id = id; }

    public String getTitle()                    { return title; }
    public void setTitle(String title)          { this.title = title; }

    public ChecklistType getCheckListType()                   { return checkListType; }
    public void setCheckListType(ChecklistType checkListType) { this.checkListType = checkListType; }

    public int getVersion()                     { return version; }
    public void setVersion(int version)         { this.version = version; }

    public boolean isActive()                   { return active; }
    public void setActive(boolean active)       { this.active = active; }

    public FormLayout getLayout()               { return layout; }
    public void setLayout(FormLayout layout)    { this.layout = layout; }

    public String getPaperReference()                   { return paperReference; }
    public void setPaperReference(String paperReference) { this.paperReference = paperReference; }
    public String getPaperEdition()                     { return paperEdition; }
    public void setPaperEdition(String paperEdition)    { this.paperEdition = paperEdition; }
    public String getPaperDate()                        { return paperDate; }
    public void setPaperDate(String paperDate)          { this.paperDate = paperDate; }

    public String getFillRoles()                { return fillRoles; }
    public void setFillRoles(Collection<UserRole> roles) { this.fillRoles = joinRoles(roles); }
    public String getReadRoles()                { return readRoles; }
    public void setReadRoles(Collection<UserRole> roles) { this.readRoles = joinRoles(roles); }

    // whether this role may list, open and send the form. The admin, who creates the forms, always may
    public boolean canFill(UserRole role)
    {
        return fillRoles == null || role == UserRole.ADMIN || splitRoles(fillRoles).contains(role);
    }

    // whether this role may read every report sent with the form (not only its own)
    public boolean canReadAll(UserRole role)
    {
        return readRoles != null && splitRoles(readRoles).contains(role);
    }

    // "QUALITY,SALES"; null for none, so "every role" (fill) and "nobody else" (read) stay null
    private static String joinRoles(Collection<UserRole> roles)
    {
        return roles == null || roles.isEmpty() ? null
                : roles.stream().distinct().map(UserRole::name).collect(Collectors.joining(","));
    }

    // an unknown name (a role removed since) is skipped, not an error
    private static List<UserRole> splitRoles(String roles)
    {
        return Arrays.stream(roles.split(",")).map(String::strip)
                .filter(name -> Arrays.stream(UserRole.values()).anyMatch(r -> r.name().equals(name)))
                .map(UserRole::valueOf).toList();
    }

    public String getInstructions()                     { return instructions; }
    public void setInstructions(String instructions)    { this.instructions = instructions; }

    public List<CheckListItem> getQuestions() { return Collections.unmodifiableList(questions); }
    // replaces all questions, going through addQuestion so each item gets its template
    public void setQuestions(List<CheckListItem> newQuestions) {
        List<CheckListItem> copy = new ArrayList<>(newQuestions); // safe if newQuestions == questions
        questions.clear();               // keep the same list object: orphanRemoval needs it
        for (CheckListItem item : copy)
            addQuestion(item);
    }

    public void addQuestion(CheckListItem item)
    {
        item.setPosition(questions.size() + 1);
        questions.add(item);
        item.setTemplate(this);
    }
}
