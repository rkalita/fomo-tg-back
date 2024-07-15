async function routes(fastify, options) {

    // INIT TABLE. Launch just once to create the table
    fastify.get('/api/initDB', (req, reply) => {
        return fastify.pg.transact(async client => {

            await client.query('CREATE TABLE IF NOT EXISTS "users" ("tg_id" varchar(250) PRIMARY KEY,"tg_username" varchar(250),"wallet_address" varchar(250) UNIQUE,"score" integer, "energy" integer NOT NULL DEFAULT 0, referral_code VARCHAR(20) UNIQUE, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "first_day_drink" TIMESTAMPTZ, last_taps_count integer NOT NULL DEFAULT 0, captcha_rewarded_at TIMESTAMPTZ, event_score integer default 0, joined_to_event BOOLEAN DEFAULT false);');
            await client.query('CREATE TABLE IF NOT EXISTS "inventory" ("tg_id" varchar(250) PRIMARY KEY,"cola" integer NOT NULL DEFAULT 0,"super_cola" integer NOT NULL DEFAULT 0,"yellow_cola" integer NOT NULL DEFAULT 0,"donut" integer NOT NULL DEFAULT 0,"gold_donut" integer NOT NULL DEFAULT 0, "lootbox" integer NOT NULL DEFAULT 0, "nft" integer NOT NULL DEFAULT 0, "exclusive_nft" integer NOT NULL DEFAULT 0, "apt" DECIMAL(10, 2) NOT NULL DEFAULT 0, "fomo" bigint NOT NULL DEFAULT 0, "dumdum" bigint NOT NULL DEFAULT 0);');
            await client.query('CREATE TABLE IF NOT EXISTS "refs" ("referral_id" varchar(250),"referrer_id" varchar(250) UNIQUE,"rewarded" TIMESTAMPTZ,"created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
            await client.query('CREATE TABLE IF NOT EXISTS "transactions" ("wallet_address" varchar(250),"date" BIGINT,"amount" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
            await client.query('CREATE TABLE IF NOT EXISTS "lootboxes" (id SERIAL PRIMARY KEY, apt DECIMAL(10, 2), fomo BIGINT, dumdum BIGINT, nft integer, exclusive_nft integer, donut BIGINT, gold_donut INTEGER, yellow_cola INTEGER,super_cola INTEGER, tg_id varchar(250), rewarded BOOLEAN DEFAULT false, opened_at TIMESTAMPTZ, group_id integer);');
            await client.query('CREATE TABLE IF NOT EXISTS "nfts" (id SERIAL PRIMARY KEY, title varchar(250));');
            await client.query('CREATE TABLE IF NOT EXISTS "exclusive_nfts" (id SERIAL PRIMARY KEY, title varchar(250));');
            await client.query('CREATE TABLE IF NOT EXISTS "users_hash" ("tg_id" varchar(250), hash varchar(250), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
            await client.query('CREATE TABLE IF NOT EXISTS "events" (id SERIAL PRIMARY KEY, name varchar(250), super_cola integer NOT NULL DEFAULT 0, start_at TIMESTAMPTZ, finish_at TIMESTAMPTZ, finished BOOLEAN DEFAULT false);');
            await client.query('CREATE TABLE IF NOT EXISTS "users_events" (tg_id varchar(250), event_id integer, joined_at TIMESTAMPTZ, score integer, super_cola integer default 0, gold_donut integer default 0);');
            await client.query('CREATE TABLE IF NOT EXISTS "lootbox_groups" (group_id integer NOT NULL, wallet_address varchar(250) UNIQUE);');

            //INDEXES
            await client.query('CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users (tg_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_users_score ON users (score);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_tg_id ON inventory (tg_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_refs_referrer_id ON refs (referrer_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_refs_rewarded ON refs (rewarded);');

            return true;
        })
    });
    
    fastify.get('/api/updateDB', async (req, reply) => {
        const query = req.query;

        if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
            return reply.status(422).send(new Error('Invalid data'));
        }

        return fastify.pg.transact(async client => {

            await client.query('UPDATE users SET event_score = 0');
            await client.query('CREATE TABLE IF NOT EXISTS "events" (id SERIAL PRIMARY KEY, name varchar(250), start_at TIMESTAMPTZ, finish_at TIMESTAMPTZ, finished BOOLEAN DEFAULT false);');
            await client.query('CREATE TABLE IF NOT EXISTS "users_events" (tg_id varchar(250), event_id integer, joined_at TIMESTAMPTZ, score integer);');
            await client.query('ALTER TABLE users ADD COLUMN joined_to_event BOOLEAN DEFAULT false');

            return true;
        })
    });

    // LOOTBOXES
    fastify.get('/api/lootboxes-insert', (req, reply) => {
        return fastify.pg.transact(async client => {
            const query = req.query;

            if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
                return reply.status(422).send(new Error('Invalid data'));
            }

            // Define the loot items with exact counts
            const lootCounts = [
                { apt: 1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 10, group_id: 1 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 30, group_id: 1 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 16, group_id: 1 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 1 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 1 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 476, group_id: 1 },

                { apt: 1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 5, group_id: 2 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 15, group_id: 2 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 8, group_id: 2 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 1, group_id: 2 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 2 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 163, group_id: 2 },


                { apt: 1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 4, group_id: 3 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 8, group_id: 3 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 6, group_id: 3 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 2, group_id: 3 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 3 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 102, group_id: 3 },

                { apt: 1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 4 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 4, group_id: 4 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 4, group_id: 4 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 2, group_id: 4 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 4 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 54, group_id: 4 },

                { apt: 1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 5 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 4, group_id: 5 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 4, group_id: 5 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 2, group_id: 5 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 5 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 52, group_id: 5 },

                { apt: 1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 6 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 4, group_id: 6 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 4, group_id: 6 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 2, group_id: 6 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 6 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 47, group_id: 6 },

                { apt: 0.1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 10, group_id: 7 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 7 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 7 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 7 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 7 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 21, group_id: 7 },

                { apt: 0.1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 5, group_id: 8 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 8 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 8 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 8 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 8 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 13, group_id: 8 },

                { apt: 0.1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 5, group_id: 9 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 9 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 9 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 9 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 9 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 12, group_id: 9 },

                { apt: 0.1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 10 },
                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 10 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 10 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 10 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 10 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 4, group_id: 10 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 11 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 11 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 11 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 11 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 12 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 12 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 12 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 12 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 13 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 13 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 13 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 14 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 14 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 14 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 15 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 5, group_id: 15 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 3, group_id: 15 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 16 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 3, group_id: 16 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 16 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 17 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 3, group_id: 17 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 17 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 18 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 3, group_id: 18 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 18 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 19 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 3, group_id: 19 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 19 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 20 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 20 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 21 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 21 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 22 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 22 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 23 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 23 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 24 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 24 },

                { apt: null, fomo: null, nft: null, donut: 75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 25 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 25 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 26 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 27 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 3, group_id: 28 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 29 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 30 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 31 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 32 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 33 },

                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 2, group_id: 34 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 35 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 36 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 37 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 38 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 39 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 40 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 41 },

                { apt: null, fomo: null, nft: null, donut: 50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1, group_id: 42 },
            ];

            // Function to shuffle an array
            function shuffle(array) {
                for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
                }
                return array;
            }

            async function generateAndInsertLootboxes() {
                const lootboxes = [];

                // Generate rows for each loot item
                lootCounts.forEach(item => {
                for (let i = 0; i < item.count; i++) {
                    const lootbox = {
                        apt: item.apt,
                        fomo: item.fomo,
                        nft: null,
                        gold_donut: item.gold_donut,
                        donut: item.donut,
                        yellow_cola: item.yellow_cola,
                        super_cola: item.super_cola,
                        dumdum: item.dumdum,
                        group_id: item.group_id
                    };

                    lootboxes.push(lootbox);
                }
                });

                // Shuffle the lootboxes array
                shuffle(lootboxes);

                try {
                await client.query('BEGIN');

                for (const lootbox of lootboxes) {
                    const query = `
                    INSERT INTO lootboxes (apt, fomo, nft, gold_donut, yellow_cola, super_cola, donut, dumdum, group_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `;

                    const values = [
                        lootbox.apt || null,
                        lootbox.fomo || null,
                        lootbox.nft || null,
                        lootbox.gold_donut || null,
                        lootbox.yellow_cola || null,
                        lootbox.super_cola || null,
                        lootbox.donut || null,
                        lootbox.dumdum || null,
                        lootbox.group_id,
                    ];

                    await client.query(query, values);
                }

                await client.query('COMMIT');
                    console.log('Lootboxes generated and inserted successfully');
                } catch (err) {
                await client.query('ROLLBACK');
                    console.error('Error generating or inserting lootboxes:', err);
                } finally {
                    await client.end();
                }
            }

            generateAndInsertLootboxes();
        });
    });
}
    
module.exports = routes;
