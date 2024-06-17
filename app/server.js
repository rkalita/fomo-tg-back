const fastify = require('fastify')({ logger: true });
fastify.register(require('fastify-postgres'), {
  connectionString: `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_SERVICE}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`,
});
fastify.register(require('./routes'));
fastify.register(require('./routes/bot'));
fastify.register(require('./routes/cron'));
fastify.register(require('./routes/migrations'));
fastify.register(require('./routes/swap'));
fastify.register(require('./routes/users'));

fastify.addHook("onRequest", async (request, reply) => {
	reply.header("Access-Control-Allow-Origin", `${process.env.ALLOW_ORIGIN}`);
	reply.header("Access-Control-Allow-Credentials", true);
	reply.header("Access-Control-Allow-Headers", "Authorization, Origin, X-Requested-With, Content-Type, Accept, X-Slug, X-UID");
	reply.header("Access-Control-Allow-Methods", "OPTIONS, POST, PUT, PATCH, GET, DELETE");
	if (request.method === "OPTIONS") {
		reply.send();
	}
});


// Run the server
const start = () => {
  fastify.listen(3000, '0.0.0.0', (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
};
start();