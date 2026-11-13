import { Router } from 'express';
import authRoutes from './auth.js';
import teamsRoutes from './teams.js';
import attendanceRoutes from './attendance.js';
import analyticsRoutes from './analytics.js';
import mobileRoutes from './mobile.js';
import geofencesRoutes from './geofences.js';
import geofenceEventsRoutes from './geofenceEvents.js';
import healthRoutes from './health.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/teams', teamsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/mobile', mobileRoutes);
router.use('/geofences', geofencesRoutes);
router.use('/geofence-events', geofenceEventsRoutes);

export default router;
