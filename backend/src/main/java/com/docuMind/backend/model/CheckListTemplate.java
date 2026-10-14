/*  ChecklistTemplate        pont roulant, travail avec produits inflammables…
 ├─ id, title, type, version, active
 └─ ChecklistItem[]      order, label_fr, label_ar, critical, answerType
                         answerType: BON_MAUVAIS | OUI_NON_NA | NUMBER | TEXT | PHOTO

*/
package com.docuMind.backend.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.docuMind.backend.model.enums.ChecklistType;

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
