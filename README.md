# Distributed Incident Management with Vector Clocks

A resilient, multi-region incident management backend that ensures causal ordering and conflict detection using Vector Clocks. Designed for high availability and eventual consistency in geographically distributed environments.

##  Overview

In distributed systems, physical clocks are unreliable for ordering events due to clock skew and network latency. This project implements **Vector Clocks** to track the "happened-before" relationship between updates across three independent regions: **US**, **EU**, and **APAC**.

### Key Features
- **Causal Ordering**: Guaranteed event ordering without physical clock synchronization.
- **Conflict Detection**: Automatically flags concurrent updates that cannot be ordered.
- **Manual Resolution**: API endpoints to resolve detected conflicts and merge states.
- **Asynchronous Replication**: Periodic background synchronization between regions.
- **Fault Tolerance**: Each region operates independently with its own database.

##  Architecture

The system consists of three identical Node.js services, each paired with a dedicated PostgreSQL database.

- **Frontend API**: Standard REST endpoints for incident creation and updates.
- **Internal Replication API**: Private endpoints used for service-to-service synchronization.
- **Vector Clock Module**: Pure functional implementation of vector clock logic (increment, compare, merge).
- **Replication Worker**: A background process in each service that polls for local changes and pushes them to peer regions.

##  Tech Stack
- **Node.js**: Primary application runtime.
- **Express**: Web framework for RESTful APIs.
- **PostgreSQL**: Relational database for persistence and JSONB support.
- **Docker & Docker Compose**: Orchestration and containerization.
- **Axios**: HTTP client for inter-region replication.

##  Getting Started

### Prerequisites
- Docker and Docker Compose
- `curl` and `jq` (for running the simulation script)

### Installation & Startup
1. Clone the repository and navigate to the project root.
2. Initialize the environment:
   ```bash
   cp .env.example .env
   ```
3. Start the entire system:
   ```bash
   docker-compose up -d --build
   ```

All services will be available at:
- **US Region**: `http://localhost:3001`
- **EU Region**: `http://localhost:3002`
- **APAC Region**: `http://localhost:3003`

##  Verification & Simulation

To demonstrate the system's ability to detect conflicts during a network partition, run the provided simulation script:

```bash
docker exec vectorclocks-region-us-1 bash /app/simulate_partition.sh
```

### What the script does:
1. Creates an incident in the **US** region.
2. Verifies replication to the **EU** region.
3. Simulates a **network partition** between US and EU.
4. Performs **concurrent updates** in both regions.
5. Resumes replication and triggers a conflict detection.
6. Displays the incident with `version_conflict: true`.
7. Resolves the conflict and shows the final consistent state.

##  API Reference

### Public Endpoints
- `POST /incidents`: Create a new incident.
- `GET /incidents/:id`: Fetch incident details.
- `PUT /incidents/:id`: Update an incident (requires client vector clock).
- `POST /incidents/:id/resolve`: Resolve a version conflict.

### Internal Endpoints
- `POST /internal/replicate`: Receive replicated data from peers.
- `GET /health`: Healthcheck for orchestration.

## 📜 Design Decisions
- **Vector Clock Representation**: Stored as `JSONB` in PostgreSQL for efficient querying and updates.
- **Conflict Strategy**: The system flags conflicts for manual intervention rather than using arbitrary "last-write-wins" to prevent data loss.
- **Idempotency**: Replication logic uses vector clock comparisons to ensure processing the same update multiple times is safe.
