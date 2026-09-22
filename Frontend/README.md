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

`/upload` validates objects with the backend, `/rules` builds tag rules, and `/preview` shows the read-only tag plan. Confirming the preview stores a confirmation and opens `/batch-job`. That page does not create an S3 Batch Operations job. The browser never talks to AWS.
