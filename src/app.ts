import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import authRoutes         from "./modules/auth/auth.routes";
import userRoutes         from "./modules/users/user.routes";
import linkingRoutes      from "./modules/linking/linking.routes";
import notificationRoutes from "./modules/notifications/notification.routes";
import subscriptionRoutes from "./modules/subscriptions/subscription.routes";
import adminRoutes        from "./modules/admin/admin.routes";
import profileRoutes      from "./modules/profiles/profile.routes";
import availabilityRoutes from "./modules/profiles/availability.routes";
import documentRoutes     from "./modules/documents/document.routes";
import dashboardRoutes    from "./modules/dashboard/dashboard.routes";
import jobRoutes          from "./modules/jobs/job.routes";
import pmRoutes           from "./modules/pm/pm.routes";
import uploadRoutes       from "./modules/upload/upload.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import { requireAuth }    from "./middleware/auth.middleware";
import { asyncHandler }   from "./utils/async-handler";
import { listInvoices }   from "./modules/jobs/job.controller";

const app = express();

// CORS — allow Web (3000) and any future client listed in CORS_ORIGIN
const allowedOrigins = new Set(env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / postman / Flutter
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ── Static file serving (dev only) ─────────────────────────────────────────
// Serves uploaded files at GET /uploads/<relPath>.
// In production this route is never reached — files are served from S3/R2
// directly (pre-signed URLs returned by document.service.ts → buildFileUrl()).
// The UPLOAD_DIR env var points to the same folder Multer writes to.
app.use(
  "/uploads",
  express.static(path.resolve(env.UPLOAD_DIR)),
);

// ── Health ──────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "shiftify-backend", env: env.NODE_ENV });
});

// ── Routes ──────────────────────────────────────────────────────────────────
// More-specific /users/me/* paths MUST come BEFORE the /users catch-all so
// Express doesn't try to route them through user.routes.ts first.
app.use("/users/me/profile",      profileRoutes);
app.use("/users/me/availability", availabilityRoutes);
app.use("/users/me/documents",    documentRoutes);

app.use("/auth",          authRoutes);
app.use("/users",         userRoutes);
app.use("/linking",       linkingRoutes);
app.use("/notifications", notificationRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/admin",         adminRoutes);
app.use("/dashboard",     dashboardRoutes);
app.use("/jobs",          jobRoutes);
app.get ("/invoices",     requireAuth, asyncHandler(listInvoices));
app.use("/pm",            pmRoutes);
app.use("/upload",        uploadRoutes);

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

// ── Global error handler (must be last) ─────────────────────────────────────
app.use(errorMiddleware);

export default app;
