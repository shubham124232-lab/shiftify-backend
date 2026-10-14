import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./support-ticket.controller";

const router = Router();
router.use(requireAuth);
router.post("/", asyncHandler(ctrl.createTicket));
router.get("/", asyncHandler(ctrl.listTickets));

export default router;
