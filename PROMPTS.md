# AI Prompts & Generation Plan

This repository was generated as part of the Zeotap Infrastructure / SRE Intern assignment. Below is a summary of the generation strategy used by the AI coding assistant (Gemini 3.1 Pro) to build the Incident Management System.

## Architectural Prompts & Decisions
- **Prompt intent**: "Design a highly resilient ingestion pipeline that will not crash under 10,000 signals/sec."
- **Decision**: Implemented an async worker model. The Express API (`POST /api/signals`) is purely a lightweight gateway that accepts the payload, pushes it to an in-memory Redis List (`rPush`), and immediately returns a `202 Accepted`. This completely decouples the ingestion API from the slower disk-based persistence layers (PostgreSQL and MongoDB).

## Debouncing Logic Prompts
- **Prompt intent**: "Implement the debouncing logic where 100 signals within 10 seconds for the same Component ID generate only 1 Work Item, but all 100 signals are retained in NoSQL."
- **Decision**: A background worker process pulls batches of signals from the Redis Queue. For each signal, it checks a Redis key (`debounce:{componentId}`). If the key does not exist, it creates a new Work Item in PostgreSQL and sets the Redis key with an expiry of 10 seconds. All subsequent signals in that window simply fetch the Work Item ID from the Redis cache. All raw signals are then bulk-inserted (`insertMany`) into MongoDB.

## Data Persistence Strategy
- **Prompt intent**: "Follow the exact persistence distribution outlined in the assignment (Data Lake, Source of Truth, Cache Hot-Path)."
- **Decision**:
  - **Data Lake**: MongoDB was chosen for its high-throughput document storage capabilities to hold raw signal payloads.
  - **Source of Truth**: PostgreSQL was chosen for its strict ACID compliance to handle Work Item states and RCA records.
  - **Hot-Path Cache**: Redis Pub/Sub combined with Server-Sent Events (SSE) was chosen to push real-time updates directly to the React frontend, bypassing the need to constantly poll PostgreSQL.

## Frontend UI/UX Prompts
- **Prompt intent**: "Build an aesthetic, responsive UI using React with live feeds and RCA submission forms."
- **Decision**: Built a React application using Vite. CSS variables and glassmorphism techniques were used to create a modern, premium look. Server-Sent Events (`EventSource`) were implemented for the Live Feed to satisfy the real-time requirement.

## Observability & Resilience Prompts
- **Prompt intent**: "Ensure rate limiting and observability metrics are present."
- **Decision**: Integrated `express-rate-limit` to prevent cascading failures. Added a `/health` endpoint and a `setInterval` function that calculates and logs the ingestion throughput (signals/sec) to the console every 5 seconds.
