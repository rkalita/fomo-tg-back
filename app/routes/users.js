const { AccountAddress } = require('@aptos-labs/ts-sdk');

async function routes(fastify, options) {
    const getExclusiveNFT = require('./helpers/exclusive-nft.helper');
    
    // GET users
    fastify.get('/api/users', async (req, reply) => {  
      try {
        const client = await fastify.pg.connect();
        const query = req.query;
        let sql = '';

        if (query['weekly']) {
          const activeEvent = await client.query(
            `SELECT * FROM events WHERE finished = false`
          );

          if (activeEvent.rows.length) {
            sql = `SELECT users.tg_id, users.tg_username, users.event_score 
                  FROM users 
                  WHERE users.event_score != 0 
                  ORDER BY users.event_score DESC, users.tg_username 
                  LIMIT 10`;
          } else {
            sql = `SELECT u.tg_id, u.tg_username, ue.score 
                  FROM users u 
                  JOIN users_events ue ON ue.tg_id = u.tg_id 
                  WHERE ue.event_id = (
                      SELECT id 
                      FROM events 
                      WHERE finished = true 
                      ORDER BY id DESC 
                      LIMIT 1
                  )
                  ORDER BY ue.score DESC 
                  LIMIT 10`;
          }
        } else {
          sql = `SELECT users.tg_id, users.tg_username, users.score 
                FROM users 
                ORDER BY users.score DESC, users.tg_username${!query['unlimit'] ? ' LIMIT 100' : ''}`;
        }

        const result = await client.query(sql);
        client.release();
        reply.send(result.rows);

      } catch (err) {
        reply.send(err);
      }
    });

  
    //GET ONE USER
    fastify.get('/api/users/:id', async (req, reply) => {
      try {
        const userId = req.params.id;
        const client = await fastify.pg.connect();
        let event = {};
        let exclusiveNft = {};
    
        try {
          const userResult = await client.query(
            `SELECT users.tg_id, users.tg_username, users.wallet_address, users.score, users.event_score, users.energy, 
                    users.first_day_drink, users.referral_code, users.joined_to_event, inventory.cola, inventory.super_cola, 
                    inventory.yellow_cola, inventory.lootbox, inventory.donut, inventory.gold_donut,
                    inventory.nft, inventory.fomo, inventory.dumdum, inventory.exclusive_nft, inventory.apt 
              FROM users 
              INNER JOIN inventory ON users.tg_id = inventory.tg_id 
              WHERE users.tg_id = $1`,
            [userId]
          );
          let user = userResult.rows[0];
    
          const positionResult = await client.query(
            `WITH ranked_table AS (
                SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, users.tg_username) AS row_num 
                FROM users
              ) 
              SELECT row_num 
              FROM ranked_table 
              WHERE tg_id = $1`,
            [userId]
          );
          const position = positionResult.rows[0];
    
          const weeklyPositionResult = await client.query(
            `WITH ranked_table AS (
                SELECT *, ROW_NUMBER() OVER (ORDER BY event_score DESC, users.tg_username) AS row_num 
                FROM users
              ) 
              SELECT row_num 
              FROM ranked_table 
              WHERE tg_id = $1`,
            [userId]
          );
          const weeklyPosition = weeklyPositionResult.rows[0];
    
          const invitedResult = await client.query(
            `SELECT COUNT(*) AS count 
              FROM refs 
              WHERE referral_id = $1`,
            [userId]
          );
          const invited = invitedResult.rows[0];
    
          if (user.cola < 4 && user.first_day_drink) {
            const firstDayDrinkDateTime = new Date(user.first_day_drink);
            const currentDate = new Date();
            const timeDifferenceHours = (currentDate - firstDayDrinkDateTime) / (1000 * 60 * 60);
    
            if (timeDifferenceHours >= 6) {
              const recoveredBottlesCount = Math.floor(timeDifferenceHours / 6);
              const inventoryResult = await client.query(
                `UPDATE inventory
                  SET cola = CASE
                    WHEN cola + $1 <= 4 THEN cola + $1
                    ELSE 4
                  END
                  WHERE tg_id = $2 
                  RETURNING cola`,
                [recoveredBottlesCount, userId]
              );
    
              await client.query(
                `UPDATE users 
                  SET first_day_drink = first_day_drink + INTERVAL '6 hours' * $1 
                  WHERE tg_id = $2`,
                [recoveredBottlesCount, userId]
              );
    
              user.cola = inventoryResult.rows[0].cola;
            }
          }
  
          const activeEvent = await client.query(
            `SELECT * FROM events WHERE (NOW() BETWEEN start_at AND finish_at) AND finished = false`
          );
  
          if (user.joined_to_event && activeEvent.rows[0]) {
            event = activeEvent.rows[0];
          }
  
          exclusiveNft = await getExclusiveNFT(client, user);
  
          client.release();
          reply.send(
            { 
              ...user,
              rate: +position.row_num, 
              weekly_rate: +weeklyPosition.row_num, 
              invited: +invited.count, 
              event_ends_at: event?.finish_at || null, 
              active_event: activeEvent?.rows?.length ? activeEvent.rows[0].name : null,
              exclusiveNft
            });
        } catch (err) {
          client.release();
          console.error('Database query error:', err);
          reply.status(500).send(new Error('Internal Server Error'));
        }
      } catch (err) {
        console.error('Connection error:', err);
        reply.status(500).send(new Error('Internal Server Error'));
      }
    });
    
    //Create user
    fastify.post('/api/users', (request, reply) => {
      return fastify.pg.transact(async client => {
        const newUser = request.body;
        const randomString = Array.from(crypto.getRandomValues(new Uint8Array(15)))
                            .map(b => String.fromCharCode(65 + b % 26))
                            .join('');
        const refCode = btoa(randomString).substring(0, 15);
  
        const userExists = await client.query(`SELECT * FROM users WHERE tg_id='${newUser.tg_id}'`);
  
        if (!userExists?.rows?.length) {
          const users = await client.query(`INSERT into users (tg_id,tg_username,score,energy, referral_code) VALUES(${newUser.tg_id},'${newUser.tg_username || 'DonutLover'}',0,50,'${refCode}') ON CONFLICT DO NOTHING RETURNING tg_id;`);
          await client.query(`INSERT into inventory (tg_id,cola,super_cola,donut,gold_donut) VALUES(${newUser.tg_id},2,0,0,0) ON CONFLICT DO NOTHING;`);
  
          if (users.rows?.length && newUser?.refCode) {
            const refUser = await client.query(`SELECT tg_id FROM users WHERE referral_code='${newUser?.refCode}'`);
            if (refUser.rows?.length) {
              await client.query(`INSERT INTO refs (referral_id, referrer_id)
              SELECT '${refUser.rows[0].tg_id}', '${newUser.tg_id}'
              WHERE NOT EXISTS (
                  SELECT 1
                  FROM refs
                  WHERE referrer_id = '${newUser.tg_id}'
                    AND referral_id = '${refUser.rows[0].tg_id}'
              );`);
            }
          }
          console.log(`NEW_USER - User id: ${users.rows[0].tg_id}, score: ${users.rows[0].score}, energy: ${users.rows[0].energy}`);
    
          return users.rows[0];
        }
    
        return userExists.rows[0];
      })
    });
    
    // Update user
    fastify.put('/api/users/:id', async (request, reply) => {
      return fastify.pg.transact(async client => {
        const userId = request.params.id;
        const body = request.body;

        // Check if the provided wallet address is valid
        if (!AccountAddress.isValid({ input: body?.wallet_address }).valid) {
          reply.status(422).send({ error: {wallet_address: 'Invalid wallet address' }});
          return reply;
        }

        // Check if the username already exists
        const userWithSameUsername = await client.query(`SELECT * FROM users WHERE tg_username = $1 AND tg_id != $2`, [body?.tg_username, userId]);
        if (userWithSameUsername?.rows.length) {
          reply.status(422).send({ error: {tg_username: 'Username already exists' }});
          return reply;
        }

        // Check if the wallet address already exists
        const userWithSameWallet = await client.query(`SELECT * FROM users WHERE wallet_address = $1 AND tg_id != $2`, [body?.wallet_address, userId]);
        if (userWithSameWallet?.rows.length) {
          reply.status(422).send({ error: {wallet_address: 'Wallet address already exists' }});
          return reply;
        }

        // Update user with new wallet address and username
        const user = await client.query(`UPDATE users SET wallet_address = $1, tg_username = $2 WHERE tg_id = $3 RETURNING *`, [body?.wallet_address, body?.tg_username, userId]);

        // Send the updated user back in the response
        reply.send(user.rows[0]);
        return reply;
      });
    });


    
    fastify.patch('/api/users-check', async (request, reply) => {
      try {
        await fastify.pg.transact(async client => {
          const body = request.body;
          let userResult;
    
          if (!body?.hash) {
            reply.status(404).send({ error: 'Hash is required' });
            return;
          }
          
          userResult = await client.query(`SELECT * FROM users_hash WHERE hash = $1`, [body.hash]);
    
          if (!userResult?.rows.length) {
              userResult =  await client.query(`INSERT INTO users_hash (hash, updated_at) VALUES ($1, NOW()) RETURNING *`, [body.hash]);
          }
    
          reply.send({ tg_id: userResult.rows[0]?.tg_id || false });
        });
      } catch (err) {
        reply.status(500).send({ error: 'An error occurred', details: err.message });
      }
    });
    
    fastify.put('/api/users-hash', async (request, reply) => {
        try {
          await fastify.pg.transact(async client => {
            const body = request.body;
      
            if (!body?.hash || !body?.tg_id) {
              reply.status(400).send({ error: 'Hash and tg_id are required' });
              return;
            }
            
            const userResult = await client.query(`UPDATE users_hash SET tg_id = $1 WHERE hash = $2 RETURNING *`, [body.tg_id, body.hash]);
      
            if (!userResult.rows.length) {
              reply.status(404).send({ error: 'User not found' });
              return;
            }
      
            reply.send(userResult.rows[0]);
          });
        } catch (err) {
          reply.status(500).send({ error: 'An error occurred', details: err.message });
        }
    });
}
    
module.exports = routes;