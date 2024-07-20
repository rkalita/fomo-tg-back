async function routes(fastify, options) {
    fastify.get('/api/refCheck', async (req, reply) => {
        const query = req.query;
      
        if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
          return reply.status(422).send(new Error('Invalid data'));
        }
      
        try {
          await fastify.pg.transact(async client => {
            await client.query(`
              WITH eligible_referrers AS (
                SELECT refs.referral_id, COUNT(*) AS referrers_count
                FROM refs
                JOIN users ON refs.referrer_id = users.tg_id
                WHERE users.score >= 100000 AND refs.rewarded IS NULL
                GROUP BY refs.referral_id
              )
              UPDATE inventory
              SET donut = donut + (25000 * eligible_referrers.referrers_count)
              FROM eligible_referrers
              WHERE inventory.tg_id = eligible_referrers.referral_id;
            `);
      
            await client.query(`
              WITH eligible_referrers AS (
                SELECT refs.referral_id
                FROM refs
                JOIN users ON refs.referrer_id = users.tg_id
                WHERE users.score >= 100000 AND refs.rewarded IS NULL
              )
              UPDATE refs
              SET rewarded = NOW()
              FROM eligible_referrers
              WHERE refs.referral_id = eligible_referrers.referral_id;
            `);
          });
      
          reply.send({ success: true });
        } catch (error) {
          console.error('Transaction failed', error);
          reply.status(500).send(new Error('Internal Server Error'));
        }
    });
    
    fastify.get('/api/eventCheck', async (req, reply) => {
    const query = req.query;
    
    if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
        return reply.status(422).send(new Error('Invalid data'));
    }
    
    try {
        await fastify.pg.transact(async client => {
            const activeEvent = await client.query(
            `SELECT * FROM events WHERE finished = false`
            );

            if (!activeEvent.rows[0]) {
                return reply.status(404).send({ error: 'No active events found' });
            }

            // Mark event as finished
            await client.query(
            `UPDATE events SET finished = true WHERE id = $1`,
            [activeEvent.rows[0].id]
            );
            
            // Update users_events with event_score from users
            await client.query(
            `UPDATE users_events ue
            SET score = u.event_score
            FROM users u
            WHERE ue.tg_id = u.tg_id
                AND ue.event_id = $1`,
            [activeEvent.rows[0].id]
            );

            // Set event_score in users table to 0
            await client.query(`UPDATE users SET event_score = 0, joined_to_event = false`);

            const winners = await client.query(`select users.tg_id, users.tg_username, users.wallet_address, users_events.score, users_events.gold_donut, users_events.super_cola from users_events join users on users.tg_id=users_events.tg_id where event_id=$1 order by users_events.score desc limit 10;`, [activeEvent.rows[0].id]);

            return reply.send(winners.rows);
        });
        } catch (error) {
            console.error('Error joining event:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });
}
    
module.exports = routes;
