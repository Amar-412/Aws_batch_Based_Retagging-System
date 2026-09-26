# S3 Batch Retagging Frontend

React + Vite upload UI for the CSV object list. Styling uses Tailwind CSS. AWS calls stay in the backend.

## Setup

```powershell
cd Frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173/upload`.

`VITE_API_URL` defaults to `http://localhost:5000/api` when `.env` is absent.

## This phase

`/upload` validates objects with the backend, `/rules` builds tag rules, and `/preview` shows the read-only tag plan. Confirming the preview opens `/batch-job`. That page creates the S3 Batch Operations job only after **Create Batch Operations Job** is clicked. `/job/:jobId` shows the live job status. The browser never receives AWS credentials and never talks to AWS directly.
