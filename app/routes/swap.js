async function routes(fastify, options) {
    //Golden SWAP
    fastify.patch('/api/swap/:tg_id', (req, reply) => {
        return fastify.pg.transact(async client => {
            let goldenDonutsCount = 0;
            const donuts = req.body.donuts;
            const inventory = await client.query(`SELECT inventory.donut FROM inventory WHERE inventory.tg_id='${req.params.tg_id}'`);

            if (donuts > inventory.rows[0].donut) {
            return reply.status(422).send(new Error('Invalid data'));
            }

            goldenDonutsCount = Math.floor(+donuts / 100000);

            const inventoryUpdate = await client.query(`UPDATE inventory SET gold_donut= gold_donut + ${goldenDonutsCount}, donut= donut - ${goldenDonutsCount * 100000} WHERE tg_id='${req.params.tg_id}' RETURNING cola, super_cola, donut, gold_donut`);

            return inventoryUpdate.rows[0];
        })
    });    

    //Lucky SWAP
    fastify.patch('/api/lucky-swap/:tg_id', (req, reply) => {
    return fastify.pg.transact(async client => {
        let lootboxCount = 0;
        const donuts = req.body.donuts;
        const inventory = await client.query(`SELECT inventory.gold_donut FROM inventory WHERE inventory.tg_id='${req.params.tg_id}'`);

        if (donuts > inventory.rows[0].gold_donut) {
        return reply.status(422).send(new Error('Invalid data'));
        }

        lootboxCount = Math.floor(+donuts / 3);

        const inventoryUpdate = await client.query(`UPDATE inventory SET lootbox= lootbox + ${lootboxCount}, gold_donut= gold_donut - ${lootboxCount * 3} WHERE tg_id='${req.params.tg_id}' RETURNING cola, super_cola, donut, gold_donut, lootbox`);

        return inventoryUpdate.rows[0];
    })
    });    

    //cola SWAP
    fastify.patch('/api/cola-swap/:tg_id', (req, reply) => {
        return fastify.pg.transact(async client => {
            let colaCount = 0;
            const donuts = req.body.donuts;
            const inventory = await client.query(`SELECT inventory.gold_donut FROM inventory WHERE inventory.tg_id='${req.params.tg_id}'`);

            if (donuts > inventory.rows[0].gold_donut) {
                return reply.status(422).send(new Error('Invalid data'));
            }

            colaCount = Math.floor(+donuts / 2);

            const inventoryUpdate = await client.query(`UPDATE inventory SET super_cola= super_cola + ${colaCount}, gold_donut= gold_donut - ${colaCount * 2} WHERE tg_id='${req.params.tg_id}' RETURNING *`);

            const userResult = await client.query('SELECT joined_to_event FROM users WHERE tg_id = $1', [req.params.tg_id]);
            const user = userResult.rows[0];

            if (user.joined_to_event) {
                await client.query('UPDATE events set super_cola=super_cola+$1 WHERE finished=false', [colaCount]);
                await client.query('UPDATE users_events set super_cola=super_cola+$1 WHERE tg_id=$2', [colaCount, req.params.tg_id]);
            }

            return inventoryUpdate.rows[0];
        });
    });
}

module.exports = routes;