const express = require('express');
const { pool } = require('./db');
const router = express.Router();


router.get('/', async (req, res) => {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { rows } = await pool.query(`
        SELECT ac.id, ac.code, ac.name, ac.owner_id, ac.created_at
        FROM access_codes ac
                 JOIN access_code_members m
                      ON m.access_code_id = ac.id
        WHERE m.user_id = $1
        ORDER BY ac.created_at DESC
    `, [userId]);

    res.json(rows);
});

router.post('/create', async (req, res) => {
    const userId = req.session.user?.id;
    const { name } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });

    const code = Math.random().toString(36).slice(2,10).toUpperCase();

    try {
        const { rows } = await pool.query(`
      INSERT INTO access_codes (code, name, owner_id)
      VALUES ($1, $2, $3)
      RETURNING id, code, name, owner_id, created_at
    `, [code, name.trim(), userId]);

        const ac = rows[0];
        await pool.query(`
      INSERT INTO access_code_members (user_id, access_code_id)
      VALUES ($1, $2)
    `, [userId, ac.id]);

        res.status(201).json(ac);

    } catch (err) {
        if (err.code === '23505') {
            try {
                const newCode = Math.random().toString(36).slice(2,10).toUpperCase();
                const { rows: retryRows } = await pool.query(`
          INSERT INTO access_codes (code, name, owner_id)
          VALUES ($1, $2, $3)
          RETURNING id, code, name, owner_id, created_at
        `, [newCode, name.trim(), userId]);

                const ac = retryRows[0];
                await pool.query(`
          INSERT INTO access_code_members (user_id, access_code_id)
          VALUES ($1, $2)
        `, [userId, ac.id]);

                return res.status(201).json(ac);
            } catch (retryErr) {
                console.error(retryErr);
                return res.status(500).json({ error: 'Retry failed' });
            }
        }
        console.error(err);
        res.status(500).json({ error: 'Creation failed' });
    }
});

router.post('/join', async (req, res) => {
    const userId = req.session.user?.id;
    const { code } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!code || !code.trim()) return res.status(400).json({ error: 'Code required' });

    const { rows } = await pool.query(`
        SELECT id, code, name, owner_id, created_at
        FROM access_codes
        WHERE code = $1
    `, [code.trim()]);

    if (!rows.length) {
        return res.status(404).json({ error: 'Group not found' });
    }

    const group = rows[0];

    try {
        await pool.query(`
      INSERT INTO access_code_members (user_id, access_code_id)
      VALUES ($1, $2)
    `, [userId, group.id]);
        res.json(group);

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Already joined' });
        }
        console.error(err);
        res.status(500).json({ error: 'Join failed' });
    }
});

module.exports = router;
