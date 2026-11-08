import express from 'express';
import { getDashboardStats } from '../services/transactionService.js';

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Real aggregation from SQLite database records
 */
router.get('/stats', (req, res) => {
  try {
    const stats = getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
