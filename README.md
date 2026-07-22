# docuMind

docuMind is a full-stack document intelligence platform. Upload PDFs, and ask natural-language questions about their content — powered by a Retrieval-Augmented Generation (RAG) pipeline with OpenAI embeddings, pgvector similarity search, and Redis-cached responses.

<!-- TODO: Replace with a demo video/GIF walkthrough (upload -> ask -> answer) -->
## 🎥 Demo

[![docuMind demo](PLACEHOLDER_THUMBNAIL_IMAGE_URL)](PLACEHOLDER_DEMO_VIDEO_URL)

> _Add a short screen recording showing: signing up, uploading a document, and asking a question about it._

## ✨ Features

- **User authentication** — JWT-based auth with access/refresh tokens, admin and user roles
- **Document upload & management** — upload, preview, search, and delete PDF files
- **RAG-powered Q&A** — ask questions about your documents; answers are generated from relevant chunks retrieved via vector similarity search
- **Chunking & embeddings** — documents are parsed (Apache PDFBox), split into chunks, and embedded with OpenAI (`text-embedding-3-small`)
- **Response caching** — repeated questions are served from a Redis cache to cut down on latency and API cost
- **Admin dashboard** — manage users and files from a dedicated admin view
- **Observability** — Spring Boot Actuator + Micrometer metrics exposed to Prometheus and visualized in Grafana

## 🏗️ Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, React Router |
| Backend | Java 17, Spring Boot 3.4, Spring Security, Spring AI |
| Database | PostgreSQL + `pgvector` extension |
| Cache | Redis |
| LLM | OpenAI (chat: `gpt-4o-mini`, embeddings: `text-embedding-3-small`) |
| Monitoring | Prometheus + Grafana |
| Containerization | Docker Compose |

```
docuMind/
├── backend/         # Spring Boot API (auth, documents, ask/RAG, users)
├── my-react-app/    # React frontend
├── postgres/        # Postgres image with pgvector enabled
├── grafana/         # Auto-provisioned Prometheus datasource + RAG dashboard
└── docker-compose*.yml
```

## 📊 Monitoring

RAG pipeline metrics (questions asked, cache hit/miss ratio, embedding & retrieval latency) are exposed at `/actuator/prometheus`, scraped by Prometheus, and auto-provisioned into a ready-made Grafana dashboard (`grafana/dashboards/rag-pipeline.json`) — no manual setup needed. Log in to Grafana at http://localhost:3001 and open **docuMind → docuMind - RAG Pipeline**.

The dashboard ships with 4 panels:

<!-- TODO: Replace with Grafana dashboard screenshots -->
| Questions Asked (rate) | Cache Hit Rate |
|---|---|
| ![Questions asked chart](PLACEHOLDER_GRAFANA_ASK_RATE_CHART_URL) | ![Cache hit rate chart](PLACEHOLDER_GRAFANA_CACHE_CHART_URL) |

| Embedding Duration (p95/p50) | Retrieval Duration (p95/p50) |
|---|---|
| ![Embedding duration chart](PLACEHOLDER_GRAFANA_EMBEDDING_CHART_URL) | ![Retrieval duration chart](PLACEHOLDER_GRAFANA_RETRIEVAL_CHART_URL) |

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Setup

1. Clone the repository
   ```bash
   git clone <repo-url>
   cd docuMind
   ```

2. Configure environment variables

   Root `.env`:
   ```env
   POSTGRES_DB=documind
   POSTGRES_USER=documind
   POSTGRES_PASSWORD=your_password
   ```

   `backend/.env.local`:
   ```env
   JWT_SECRET=your_jwt_secret
   ADMIN_KEY=your_admin_registration_key
   DB_PASSWORD=your_password
   OPENAI_API_KEY=your_openai_api_key
   ```

3. Start all services
   ```bash
   docker compose up --build
   ```

### Services

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (default login: `admin` / `admin`) |

## 🔌 API Overview

| Endpoint | Description |
|---|---|
| `POST /api/auth/register` | Register a new user |
| `POST /api/auth/login` | Log in and receive JWT tokens |
| `POST /api/auth/refresh` | Refresh an access token |
| `POST /api/auth/logout` | Log out |
| `POST /api/v1/files/upload` | Upload a document |
| `GET /api/v1/files/{name}` | Fetch a document |
| `GET /api/v1/files/preview/id/{id}` | Preview a document |
| `POST /api/v1/ask` | Ask a question about your documents (RAG) |
| `GET /api/v1/users` | List users (admin) |

## 🧪 Testing

```bash
cd backend
./mvnw test
```

## 📄 License

<!-- TODO: Add license -->
