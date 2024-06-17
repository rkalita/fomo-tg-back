async function routes(fastify, options) {
    //ADD STUFF POST
    fastify.post('/api/gift', (req, reply) => {

        console.log(`gift request: ${JSON.stringify(req.body)}`);

        const updateInventory = async function(client, users, item, count) {
            for (const user of users) {
            if (item !== 'cola') {
                await client.query(`UPDATE inventory SET ${item}= ${item} + ${+count || 1} WHERE tg_id='${user.tg_id}' RETURNING *`);
            }
            }
        }

        return fastify.pg.transact(async client => {
            const body = req.body;
            
            if (!body?.secret || body?.secret !== process.env.INVENTORY_SECRET) {
            return reply.status(422).send(new Error('Invalid data'));
            }

            if (!body?.wallets || !body?.wallets?.length) {
            return reply.status(422).send(new Error('Invalid data'));
            }

            const users = await client.query(`SELECT users.tg_id, users.wallet_address, inventory.cola FROM users JOIN inventory ON users.tg_id = inventory.tg_id WHERE users.wallet_address IN (${body?.wallets.map(item => `'${item}'`).join(', ')});`);

            if (!users.rows.length) {
            return reply.status(422).send(new Error('Not found'));
            }

            await updateInventory(client, users.rows, body.item, body.count);

            return true;
        })
    });

    //EVENT RESET
    fastify.post('/api/event-reset', (request, reply) => {
        const body = request.body;

        if (!body['secret'] || body['secret'] != process.env.INVENTORY_SECRET) {
            return reply.status(422).send(new Error('Invalid data'));
        }

        return fastify.pg.transact(async client => {
            
            try {

            await client.query(`UPDATE users set event_score = 0`);
            return true;

            } catch (error) {
            console.error("Error updating event_score");
            return false;
            }
        })
    });

    //START EVENT
    fastify.post('/api/event-create', async (req, reply) => {
        let { name, secret } = req.body;

        if (!secret || secret != process.env.INVENTORY_SECRET) {
            return reply.status(422).send(new Error('Invalid data'));
        }

        if (!name) {
            name = 'event name';
        }

        try {
            // Check if there's an existing event where NOW() is between start_at and finish_at
            const checkResult = await fastify.pg.query(
                `SELECT COUNT(*) FROM events WHERE NOW() BETWEEN start_at AND finish_at`
            );

            if (checkResult.rows[0].count > 0) {
                return reply.status(409).send({ error: 'An event is already active' });
            }

            // Insert event into the events table
            const result = await fastify.pg.query(
                `INSERT INTO events (name, start_at, finish_at)
                    VALUES ($1, NOW(), NOW() + INTERVAL '7 days')
                    RETURNING id`,
                [name]
            );

            // Return the newly created event ID
            const newEventId = result.rows[0].id;
            return reply.status(201).send({ id: newEventId, message: 'Event created and started successfully' });
        } catch (error) {
            console.error('Error inserting event:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET users count
    fastify.get('/api/users-count', (req, reply) => {  
        fastify.pg.connect(onConnect)

        function onConnect (err, client, release) {
            if (err) return reply.send(err);
            const query = req.query;
            let sql = `SELECT COUNT(*) from users`;

            if (!!query) {
                if (query['wallets']) {
                    sql = `SELECT COUNT(*) from users where wallet_address is not null`;
                }

                if (query['score']) {
                    sql = `SELECT COUNT(*) from users where score != 0`;
                }

                if (query['event']) {
                    sql = `SELECT COUNT(*) from users where joined_to_event = true`;
                }

                if (query['refs'] && query['ref_code']) {
                    sql = `SELECT COUNT(*) from refs JOIN users ON users.tg_id = refs.referral_id where users.referral_code = '${query['ref_code']}'`;
                }

                if (query['refs_rewarded'] && query['ref_code']) {
                    sql = `SELECT COUNT(*) from refs JOIN users ON users.tg_id = refs.referral_id where users.referral_code = '${query['ref_code']}' AND refs.rewarded is not null`;
                }
            }

            client.query(
            sql,
            function onResult (err, result) {
                release();
                reply.send(err || result.rows[0].count);
            }
            )
        }
    })

    // GET users count
    fastify.get('/api/lootboxes-count', (req, reply) => {  
        fastify.pg.connect(onConnect)

        function onConnect (err, client, release) {
            if (err) return reply.send(err);
            const query = req.query;
            let sql = `SELECT COUNT(*) from lootboxes`;

            if (!!query) {
                if (query['opened']) {
                    sql = `SELECT COUNT(*) from lootboxes where tg_id is not null`;
                }

                if (query['closed']) {
                    sql = `SELECT COUNT(*) from lootboxes where tg_id is null`;
                }
            }

            client.query(
                sql,
                function onResult (err, result) {
                    release();
                    reply.send(err || result.rows[0].count);
                }
            )
        }
    })
}
    
module.exports = routes;