require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool, initDb } = require('./db');
const vcUtils = require('./vector_clock');
const { startReplication } = require('./replication');

const app = express();
app.use(express.json());

const REGION_ID = process.env.REGION_ID;
const PORT = process.env.PORT || 3000;

// /health endpoint for Docker healthcheck
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// GET /incidents/:id - Helper for debugging/verification
app.get('/incidents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /incidents - Create a new incident
app.post('/incidents', async (req, res) => {
    const { title, description, severity } = req.body;
    const id = uuidv4();
    const initialVc = vcUtils.initialize();
    const vector_clock = vcUtils.increment(initialVc, REGION_ID);

    try {
        const { rows } = await pool.query(
            `INSERT INTO incidents (id, title, description, status, severity, vector_clock)
       VALUES ($1, $2, $3, 'OPEN', $4, $5) RETURNING *`,
            [id, title, description, severity, JSON.stringify(vector_clock)]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /incidents/:id - Update an incident
app.put('/incidents/:id', async (req, res) => {
    const { id } = req.params;
    const { status, assigned_team, vector_clock: clientVc, title, description, severity } = req.body;

    try {
        const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

        const localIncident = rows[0];
        const comparison = vcUtils.compare(clientVc, localIncident.vector_clock);

        if (comparison === 'BEFORE') {
            return res.status(409).json({ error: 'Conflict: Stale update rejected' });
        }

        const newVc = vcUtils.increment(localIncident.vector_clock, REGION_ID);

        const updateQuery = `
      UPDATE incidents
      SET 
        status = COALESCE($2, status),
        assigned_team = COALESCE($3, assigned_team),
        title = COALESCE($4, title),
        description = COALESCE($5, description),
        severity = COALESCE($6, severity),
        vector_clock = $7,
        updated_at = NOW()
      WHERE id = $1 RETURNING *`;

        const { rows: updatedRows } = await pool.query(updateQuery, [
            id, status, assigned_team, title, description, severity, JSON.stringify(newVc)
        ]);

        res.json(updatedRows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /internal/replicate - Replication endpoint
app.post('/internal/replicate', async (req, res) => {
    const incomingIncident = req.body;
    const { id, vector_clock: vcIn } = incomingIncident;

    try {
        const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);

        if (rows.length === 0) {
            // New incident from another region
            await pool.query(
                `INSERT INTO incidents (id, title, description, status, severity, assigned_team, vector_clock)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, incomingIncident.title, incomingIncident.description,
                    incomingIncident.status, incomingIncident.severity,
                    incomingIncident.assigned_team, JSON.stringify(vcIn)]
            );
            return res.status(200).send();
        }

        const vcLocal = rows[0].vector_clock;
        const comparison = vcUtils.compare(vcIn, vcLocal);

        if (comparison === 'AFTER') {
            const mergedVc = vcUtils.merge(vcIn, vcLocal);
            await pool.query(
                `UPDATE incidents SET 
            title = $2, description = $3, status = $4, severity = $5, assigned_team = $6,
            vector_clock = $7, updated_at = NOW()
           WHERE id = $1`,
                [id, incomingIncident.title, incomingIncident.description,
                    incomingIncident.status, incomingIncident.severity,
                    incomingIncident.assigned_team, JSON.stringify(mergedVc)]
            );
        } else if (comparison === 'CONCURRENT') {
            const mergedVc = vcUtils.merge(vcIn, vcLocal);
            await pool.query(
                `UPDATE incidents SET version_conflict = true, vector_clock = $2 WHERE id = $1`,
                [id, JSON.stringify(mergedVc)]
            );
        }
        // If comparison is BEFORE or EQUAL, ignore or skip update

        res.status(200).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /incidents/:id/resolve - Resolve conflict
app.post('/incidents/:id/resolve', async (req, res) => {
    const { id } = req.params;
    const { status, assigned_team } = req.body;

    try {
        const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

        const localIncident = rows[0];
        if (!localIncident.version_conflict) {
            return res.status(400).json({ error: 'No conflict detected for this incident' });
        }

        const newVc = vcUtils.increment(localIncident.vector_clock, REGION_ID);

        const { rows: updatedRows } = await pool.query(
            `UPDATE incidents SET
             status = $2, assigned_team = $3, version_conflict = false, vector_clock = $4, updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id, status, assigned_team, JSON.stringify(newVc)]
        );

        res.json(updatedRows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start services
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`[Server] Region ${REGION_ID} listening on port ${PORT}`);
        startReplication();
    });
});
