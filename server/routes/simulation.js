import express from 'express';
import { runCrashLabScenario } from '../services/simulationService.js';

const router = express.Router();

/**
 * POST /api/simulation/scenario
 * Execute an automated Crash Lab resilience scenario using actual backend services
 */
router.post('/scenario', async (req, res) => {
  try {
    const { scenarioId, params } = req.body;
    if (!scenarioId) {
      return res.status(400).json({ error: 'scenarioId is required' });
    }

    const result = await runCrashLabScenario(scenarioId, params);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status !== 500) {
      return res.status(status).json({
        error: err.code || 'SCENARIO_EXECUTION_BLOCKED',
        code: err.code || 'SCENARIO_EXECUTION_BLOCKED',
        message: err.message,
        details: err.details || null,
      });
    }
    console.error('Run scenario error:', err);
    res.status(500).json({
      error: 'SCENARIO_EXECUTION_ERROR',
      code: 'SCENARIO_EXECUTION_ERROR',
      message: err.message,
    });
  }
});

export default router;
