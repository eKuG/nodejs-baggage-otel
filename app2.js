// app.js
const fastify = require('fastify')();
const { context, trace, propagation } = require('@opentelemetry/api');
const { initTracing, shutdownTracing } = require('./tracing');

async function main() {
  // start OT telemetry (registers Http + Fastify instrumentation with AsyncHooks context)
  await initTracing();

  // hello route
  fastify.get('/hello', async (request, reply) => {
    const tracer = trace.getTracer('example-app');
    // start a new span (parent will be the auto-created HTTP span)
    const span = tracer.startSpan('hello-handler');

    try {
      // you can still read baggage from the active context
      const baggage = propagation.getBaggage(context.active());
      console.log(
        '🧳 Current baggage in handler:',
        baggage ? Object.fromEntries(baggage.getAllEntries()) : null
      );

      // nested child span — because we're using AsyncHooks context, it will automatically
      // inherit `span` as its parent without you having to call context.with
      const child = tracer.startSpan('database-query');
      child.setAttributes({
        'db.operation': 'SELECT',
        'db.table': 'users',
      });
      child.end();

      return {
        message: 'Hello with baggage annotations!',
        baggage: baggage ? Object.fromEntries(baggage.getAllEntries()) : null,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: trace.SpanStatusCode.ERROR, message: err.message });
      reply.code(500);
      return { error: 'Internal server error' };
    } finally {
      span.end();
    }
  });

  // get-user route
  fastify.get('/user/:id', async (request, reply) => {
    const tracer = trace.getTracer('example-app');
    const span = tracer.startSpan('get-user');

    try {
      span.setAttributes({
        'user.requested_id': request.params.id,
        'http.route': '/user/:id',
      });

      const baggage = propagation.getBaggage(context.active());
      return {
        user: { id: request.params.id, name: 'John Doe' },
        context: baggage ? Object.fromEntries(baggage.getAllEntries()) : null,
      };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: trace.SpanStatusCode.ERROR, message: err.message });
      reply.code(500);
      return { error: 'Internal server error' };
    } finally {
      span.end();
    }
  });

  // graceful shutdown
  fastify.addHook('onClose', async () => {
    await shutdownTracing();
  });

  await fastify.listen({ port: 3000 });
  console.log('🚀 Server listening on port 3000');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
