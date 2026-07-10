# DocuMind

Built with Spring Boot on the backend, React on the frontend ,A multi-tenant team knowledge base that lets you upload documents and ask questions about them in natural language. , and a RAG (Retrieval Augmented Generation) pipeline backed by pgvector and OpenAI.


---

## Demo


https://github.com/user-attachments/assets/2bc2ed40-0f0f-4b0c-b292-bb2da6bd145d


> Upload a document → ask a question → get a streamed answer grounded in your own content.

---

## What it does

- **Document management** — upload PDFs, text files, and markdown. Files are stored with extracted text ready for indexing.
- **Semantic search** — documents are chunked and embedded using OpenAI's `text-embedding-3-small`. Embeddings are stored in pgvector for nearest-neighbor retrieval.
- **RAG-powered Q&A** — ask a natural language question, retrieve the most relevant chunks from your documents, and get a streamed answer from `gpt-4o-mini` grounded strictly in your content.
- **Multi-tenant auth** — JWT-based authentication with refresh token rotation and RBAC (ADMIN / MEMBER roles).
- **Workspace isolation** — every vector search is scoped to the requesting user. No cross-user data leakage.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                        │
│         Login · Upload · Search · Ask · Admin               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS + JWT
┌──────────────────────▼──────────────────────────────────────┐
│                   Spring Boot API                            │
│                                                              │
│  /api/auth/**     →  JWT issue, refresh, revoke             │
│  /api/v1/files/** →  Upload, search, download, delete       │
│  /api/v1/users/** →  User CRUD (admin-gated delete)         │
│  /api/v1/ask      →  RAG pipeline, SSE streaming            │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │  Ingestion  │   │  Retrieval   │   │    Generation    │ │
│  │  pipeline   │   │  (pgvector)  │   │  (gpt-4o-mini)   │ │
│  └──────┬──────┘   └──────┬───────┘   └────────┬─────────┘ │
└─────────┼─────────────────┼────────────────────┼───────────┘
          │                 │                    │
┌─────────▼─────────────────▼────────────────────▼───────────┐
│                      PostgreSQL + pgvector                   │
│                                                              │
│  users          refresh_tokens      files                   │
│  file_contents  document_chunks ← vector(1536) column       │
└─────────────────────────────────────────────────────────────┘
          │                                      │
    ┌─────▼──────┐                    ┌──────────▼──────────┐
    │   Redis    │                    │    OpenAI API        │
    │  (cache)   │                    │  Embeddings + Chat   │
    └────────────┘                    └─────────────────────┘
```

---

## RAG pipeline

This is how a question goes from text to answer:

**At upload time (once per document):**
1. Extract plain text from the file (PDFBox for PDFs, raw read for TXT/MD)
2. Split text into 500-word chunks with 100-word overlap so sentences on boundaries aren't lost
3. Batch-embed all chunks via `text-embedding-3-small` → `float[1536]` per chunk
4. Store each chunk + its embedding in `document_chunks` (pgvector column)

**At query time (every `/ask` call):**
1. Embed the user's question with the same model
2. Run cosine similarity search against `document_chunks` filtered by `user_id`
3. Retrieve the top 5 closest chunks
4. Build a prompt: strict system instructions + retrieved chunks as context + the question
5. Stream the response from `gpt-4o-mini` back to the browser token by token via SSE

The system prompt instructs the model to answer *only* from the provided context and explicitly say so if the answer isn't there — no hallucinated facts from training data.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router v7, Axios |
| Backend | Spring Boot 3.4.5, Spring Security, Spring AI 1.0.0 |
| Auth | JWT (jjwt 0.12.5), refresh token rotation, RBAC |
| Database | PostgreSQL 16 + pgvector extension |
| Vector search | pgvector HNSW index, cosine distance (`<=>`) |
| AI | OpenAI `text-embedding-3-small` + `gpt-4o-mini` |
| Caching | Redis 7 |
| Observability | Prometheus, Grafana, Spring Boot Actuator, Micrometer |
| Containerisation | Docker, Docker Compose |

---

## Running locally

**Prerequisites:** Docker, Java 17+, Node 18+, an OpenAI API key.

**1. Clone and configure**

```bash
git clone https://github.com/your-username/documind.git
cd documind
```

Create `backend/src/main/resources/application-local.properties`:

```properties
spring.datasource.url=jdbc:postgresql://localhost:5433/documind
spring.datasource.username=documind
spring.datasource.password=yourpassword

spring.ai.openai.api-key=sk-...
spring.ai.openai.embedding.options.model=text-embedding-3-small
spring.ai.openai.chat.options.model=gpt-4o-mini

spring.data.redis.host=localhost
spring.data.redis.port=6379

app.jwt.secret=your-base64-encoded-secret-min-32-chars
app.jwt.expiration=900000
```

**2. Start infrastructure**

```bash
docker compose up -d
```

This starts PostgreSQL (port 5433), Redis (port 6379), Prometheus (port 9090), and Grafana (port 3001).

**3. Enable pgvector**

Run once in pgAdmin or psql:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**4. Start the backend**

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Hibernate creates all tables on first boot. Swagger UI available at `http://localhost:8080/swagger-ui.html`.

**5. Start the frontend**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## API reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create account (role always `MEMBER`) |
| POST | `/api/auth/login` | Public | Returns access + refresh token |
| POST | `/api/auth/refresh` | Public | Rotate refresh token, get new access token |
| POST | `/api/auth/logout` | Public | Revoke refresh token |

### Documents

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/files/upload` | Bearer | Upload file (triggers ingestion pipeline) |
| GET | `/api/v1/files/filter/{keyword}` | Bearer | Search documents by keyword |
| GET | `/api/v1/files/id/{id}` | Bearer | Download file binary |
| DELETE | `/api/v1/files/id/{id}` | Bearer | Delete file |

### Ask

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/ask` | Bearer | Ask a question — streams SSE response |

Request body:
```json
{ "question": "What is the refund policy?" }
```

Response: `text/event-stream` — tokens arrive as SSE events as the model generates them.

### Users (admin)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/users` | Bearer | List all users |
| GET | `/api/v1/users/{id}` | Bearer | Get user by id |
| DELETE | `/api/v1/users/{id}` | ADMIN | Delete user |

---

## Security design

**Access tokens** are short-lived (15 minutes) and stateless — a stolen token is only useful for a small window. They live only in JavaScript memory, never in `localStorage`.

**Refresh tokens** are long-lived (7 days), stored in `localStorage`, and backed by a database row so they can be revoked. They're stored hashed (SHA-256) in the database — a DB leak doesn't give an attacker live sessions.

**Token rotation** — every call to `/auth/refresh` invalidates the old refresh token and issues a new one. Using the same refresh token twice after rotation signals possible theft.

**Workspace isolation** — every vector search query includes `WHERE user_id = :userId`. Documents from one user's workspace are never retrievable in another user's RAG context.

---

## Project structure

```
documind/
├── backend/
│   └── src/main/java/com/docuMind/backend/
│       ├── config/          # SecurityConfig, CorsConfig
│       ├── controller/      # AuthController, DocumentController,
│       │                    # UserController, AskController
│       ├── model/           # User, FileEntity, FileContent,
│       │                    # DocumentChunk, RefreshToken
│       ├── repository/      # JPA repositories
│       ├── security/        # JwtService, JwtAuthFilter,
│       │                    # RefreshTokenService
│       └── services/        # UserService, DocumentService,
│                            # ChunkingService, IngestionService
├── frontend/
│   └── src/
│       ├── api/             # apiClient.js (Axios + interceptors)
│       ├── components/      # Layout, FileList
│       ├── context/         # AuthContext, ThemeContext
│       ├── pages/           # Login, Signup, Upload, Search,
│       │                    # Ask, MyFiles, Admin
│       └── utils/           # jwt.js
├── docker-compose.yml
├── prometheus.yml
└── README.md
```

---

## What I'd add next

- **Reranking** — use a cross-encoder model to re-score retrieved chunks before sending them to the LLM. Better answer quality at the cost of one extra model call.
- **Hybrid search** — combine pgvector cosine similarity with Postgres full-text search (`tsvector`). Catches cases where the exact keyword matters more than semantic similarity.
- **Async ingestion** — move the chunking and embedding pipeline to a background job so the upload endpoint returns immediately with `202 Accepted` instead of blocking on the OpenAI API call.
- **Kubernetes deployment** — Helm chart with horizontal pod autoscaler on the backend, separate deployments for the ingestion worker and the API server.

---

## Author

**Hicham Essaquy** — 1337 (42 Network) · [GitHub](https://github.com/your-username) · [LinkedIn](https://linkedin.com/in/your-profile)
