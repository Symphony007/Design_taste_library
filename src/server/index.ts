import express, { Request, Response } from "express";
import path from "node:path";
import "../db/index.js";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

app.use(express.json());

// Serve static frontend files from public/
app.use(express.static(PUBLIC_DIR));

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export const server = app.listen(PORT, () => {
  console.log(`Taste server running at http://localhost:${PORT}`);
});

export default app;
