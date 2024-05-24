async function routes(fastify, options) {
    // Testing route
    fastify.get('/', async (request, reply) => {
      return { hello: 'world' };
    });
  
    //Set wallet address
    fastify.post('/api/wallet', (request, reply) => {
      fastify.pg.connect(onConnect)
    
      function onConnect (err, client, release) {
        if (err) return reply.send(err);

        console.log(request.body);
    
        client.query(
          `UPDATE users SET wallet_address='${request.body.wallet_address}' WHERE tg_id='${request.body.tg_id}'`,
          function onResult (err, result) {
            release()
            reply.send(err || result)
          }
        )
      }
    });
  
    // INIT TABLE. Launch just once to create the table
    fastify.get('/api/initDB', (req, reply) => {
      return fastify.pg.transact(async client => {

        const users = await client.query('CREATE TABLE IF NOT EXISTS "users" ("tg_id" varchar(250) PRIMARY KEY,"tg_username" varchar(250),"wallet_address" varchar(250) UNIQUE,"score" integer, "energy" integer NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "first_day_drink" TIMESTAMPTZ);');
        const inventory = await client.query('CREATE TABLE IF NOT EXISTS "inventory" ("tg_id" varchar(250) PRIMARY KEY,"cola" integer NOT NULL DEFAULT 0,"super_cola" integer NOT NULL DEFAULT 0,"donut" integer NOT NULL DEFAULT 0,"gold_donut" integer NOT NULL DEFAULT 0);');
    
        return {...users, ...inventory}
      })
    });

    // GET users
    fastify.get('/api/users', (req, reply) => {
      fastify.pg.connect(onConnect)
    
      function onConnect (err, client, release) {
        if (err) return reply.send(err)
    
        client.query(
          'SELECT users.tg_username, users.score from users ORDER BY users.score DESC LIMIT 100',
          function onResult (err, result) {
            
            release()
            reply.send(err || result.rows)
          }
        )
      }
    })
  
    //GET ONE USER
    fastify.get('/api/users/:id', (req, reply) => {
      return fastify.pg.transact(async client => {

        let user = await client.query(`SELECT users.tg_id, users.tg_username, users.wallet_address, users.score, users.energy, users.first_day_drink, inventory.cola, inventory.super_cola, inventory.donut, inventory.gold_donut from users INNER JOIN inventory ON users.tg_id = inventory.tg_id WHERE users.tg_id = '${req.params.id}'`);
        const position = await client.query(`WITH ranked_table AS (SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) AS row_num FROM "users") SELECT row_num FROM ranked_table WHERE "tg_id" = '${req.params.id}';`);

        if (user.rows[0].cola < 4 && user.rows[0].first_day_drink) {
          // Define differrence between now and first drink cola in day
          const firstDayDrinkDateTime = new Date(user.rows[0].first_day_drink);
          const currentDate = new Date();
          const timeDifferenceHours = (currentDate - firstDayDrinkDateTime) / (1000 * 60 * 60);

          if (timeDifferenceHours >= 6) {
            const recoveredBottlesCount = Math.floor(timeDifferenceHours / 6);

            const inventory = await client.query(`UPDATE inventory
              SET cola = CASE
                WHEN cola + ${recoveredBottlesCount} <= 4 THEN cola + ${recoveredBottlesCount}
                ELSE 4
              END
              WHERE tg_id = '${req.params.id}' RETURNING *;`);
            
              await client.query(`UPDATE users SET first_day_drink = first_day_drink + INTERVAL '6 hours' WHERE tg_id = '${req.params.id}';`);

            user.rows[0].cola = inventory.rows[0].cola;
          }
        }
    
        return {...user.rows[0], rate: +position.rows[0].row_num};
      })
    });
  
    //Create user
    fastify.post('/api/users', (request, reply) => {
      return fastify.pg.transact(async client => {

        const newUser = request.body;
        const users = await client.query(`INSERT into users (tg_id,tg_username,score,energy) VALUES(${newUser.tg_id},'${newUser.tg_username}',0,50) ON CONFLICT DO NOTHING;`);
        const inventory = await client.query(`INSERT into inventory (tg_id,cola,super_cola,donut,gold_donut) VALUES(${newUser.tg_id},2,0,0,0) ON CONFLICT DO NOTHING;`);
    
        return {...users, ...inventory}
      })
    });

    //GULP
    fastify.patch('/api/gulp/:user_id', (request, reply) => {
      return fastify.pg.transact(async client => {

        const gulpItems = request.body;
        let user = null;
        let inventory = null;

        if (gulpItems.item === 'cola') {
          inventory = await client.query(`UPDATE inventory
          SET cola = CASE
              WHEN cola - 1 < 0 THEN 0
              ELSE cola - 1
          END
          WHERE tg_id = '${request.params.user_id}' RETURNING *;`);

          if (inventory.rows[0].cola == 3) {
            user = await client.query(`UPDATE users
              SET energy = CASE
                  WHEN energy + 25 <= 100 THEN energy + 25
                  ELSE 100
              END,
              first_day_drink = NOW()
              WHERE tg_id = '${request.params.user_id}' RETURNING users.tg_username, users.wallet_address, users.score, users.energy;`);
          } else {
            user = await client.query(`UPDATE users
            SET energy = CASE
                WHEN energy + 25 <= 100 THEN energy + 25
                ELSE 100
            END
            WHERE tg_id = '${request.params.user_id}' RETURNING users.tg_username, users.wallet_address, users.score, users.energy;`);
          }

        } else if (gulpItems.item === 'super_cola') {

          user = await client.query(`UPDATE users SET energy = 100 
            WHERE tg_id = '${request.params.user_id}' 
            RETURNING users.tg_username, users.wallet_address, users.score, users.energy;`);

          inventory = await client.query(`UPDATE inventory
          SET super_cola = CASE
            WHEN super_cola - 1 < 0 THEN 0
            ELSE super_cola - 1
          END
          WHERE tg_id = '${request.params.user_id}' RETURNING *;`);
        }
    
        return {...user.rows[0], ...inventory.rows[0]}
      })
    });
  
    //TAP
    fastify.patch('/api/tap/:user_id', (req, reply) => {
      return fastify.pg.transact(async client => {
        let taps = req.body.taps;
      
        let user = await client.query(`SELECT users.score, users.energy FROM users WHERE users.tg_id='${req.params.user_id}'`);
        let inventory = await client.query(`SELECT inventory.donut, inventory.gold_donut FROM inventory WHERE inventory.tg_id='${req.params.user_id}'`);

        if (+taps > user.rows[0].energy) {
          taps = +user.rows[0].energy;
          reply.status(422).send(new Error('Invalid data'));
        }

        inventory = await client.query(`UPDATE inventory SET donut=${inventory.rows[0].donut + +taps * 1000} WHERE tg_id='${req.params.user_id}' RETURNING cola, super_cola, donut, gold_donut`);
    
        user = await client.query(`UPDATE users SET score=${user.rows[0].score + +taps * 1000}, energy=${user.rows[0].energy - taps} WHERE tg_id = '${req.params.user_id}' RETURNING tg_id, tg_username, wallet_address, score, energy`);

        return {...user.rows[0], ...inventory.rows[0]}
      })
    });
      
    //Add stuff to inventory by wallet_id
    fastify.get('/api/inventory/:wallet_address', (req, reply) => {
      return fastify.pg.transact(async client => {
        const query = req.query;
        
        if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
          return reply.status(422).send(new Error('Invalid data'));
        }
      
        const user = await client.query(`SELECT tg_id FROM users WHERE wallet_address='${req.params.wallet_address}'`);
        const inventory = await client.query(`UPDATE inventory SET ${query['item']}= ${query['item']} + ${+query['count'] || 1} WHERE tg_id='${user.rows[0].tg_id}' RETURNING *`);

        return inventory.rows[0];
      })
    });
  
    //DELETE ONE USER if exists
    // fastify.route({
    //   method: 'DELETE',
    //   url: '/api/users/:id',
    //   handler: async function (request, reply) {
    //     fastify.pg.connect(onConnect);
    //     function onConnect(err, client, release) {
    //       if (err) return reply.send(err);
    //       client.query(`DELETE FROM users WHERE tg_id=${request.params.id}`, function onResult(err, result) {
    //         release();
    //         reply.send(err || `Deleted: ${request.params.id}`);
    //       });
    //     }
    //   },
    // });
  }
  
  module.exports = routes;
  