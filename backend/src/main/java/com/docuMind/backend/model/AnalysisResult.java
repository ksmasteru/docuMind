package com.docuMind.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

// JsonIgnoreProperties — if Python adds new fields later,
// Jackson won't throw an error, it'll just ignore them
@JsonIgnoreProperties(ignoreUnknown = true)
public class AnalysisResult {

    private Shape shape;
    private List<String> columns;
    private List<ColumnProfile> columnProfiles;
    private List<Chart> charts;
    private String textSummary;

    // ── Shape ─────────────────────────────────────────────────────
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Shape {
        private int rows;
        private int cols;

        public int getRows() { return rows; }
        public void setRows(int rows) { this.rows = rows; }
        public int getCols() { return cols; }
        public void setCols(int cols) { this.cols = cols; }
    }

    // ── Column Profile ────────────────────────────────────────────
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ColumnProfile {
        private String name;
        private String dtype;
        private int nullCount;
        private double nullPct;
        private int uniqueCount;

        // Present for numeric columns
        private Map<String, Double> stats;

        // Present for categorical columns
        private Map<String, Integer> topValues;

        public String getName()              { return name; }
        public void setName(String n)        { this.name = n; }
        public String getDtype()             { return dtype; }
        public void setDtype(String d)       { this.dtype = d; }
        public int getNullCount()            { return nullCount; }
        public void setNullCount(int n)      { this.nullCount = n; }
        public double getNullPct()           { return nullPct; }
        public void setNullPct(double p)     { this.nullPct = p; }
        public int getUniqueCount()          { return uniqueCount; }
        public void setUniqueCount(int u)    { this.uniqueCount = u; }
        public Map<String, Double> getStats(){ return stats; }
        public void setStats(Map<String, Double> s) { this.stats = s; }
        public Map<String, Integer> getTopValues()  { return topValues; }
        public void setTopValues(Map<String, Integer> t) { this.topValues = t; }
    }

    // ── Chart ─────────────────────────────────────────────────────
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Chart {
        private String title;
        private String type;   // "histogram", "bar", "heatmap"
        private String image;  // base64 encoded PNG

        public String getTitle()          { return title; }
        public void setTitle(String t)    { this.title = t; }
        public String getType()           { return type; }
        public void setType(String t)     { this.type = t; }
        public String getImage()          { return image; }
        public void setImage(String i)    { this.image = i; }
    }

    // ── Root getters/setters ──────────────────────────────────────
    public Shape getShape()                      { return shape; }
    public void setShape(Shape shape)            { this.shape = shape; }
    public List<String> getColumns()             { return columns; }
    public void setColumns(List<String> c)       { this.columns = c; }
    public List<ColumnProfile> getColumnProfiles(){ return columnProfiles; }
    public void setColumnProfiles(List<ColumnProfile> p) { this.columnProfiles = p; }
    public List<Chart> getCharts()               { return charts; }
    public void setCharts(List<Chart> c)         { this.charts = c; }
    public String getTextSummary()               { return textSummary; }
    public void setTextSummary(String t)         { this.textSummary = t; }
}