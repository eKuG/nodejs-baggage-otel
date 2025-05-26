const express = require('express');
const { context, trace, propagation } = require('@opentelemetry/api');
const { initTracing, shutdownTracing } = require('./tracing');

const app = express();

// Initialize tracing (synchronous)
initTracing();

// Middleware to handle baggage
app.use((req, res, next) => {
  const currentBaggage = propagation.getBaggage(context.active()) || propagation.createBaggage();
  
  // Extract request context information and add to baggage
  const newBaggage = currentBaggage
    .setEntry('user.id', { value: req.headers['x-user-id'] || 'anonymous' })
    .setEntry('tenant.id', { value: req.headers['x-tenant-id'] || 'unknown' })
    .setEntry('request.path', { value: req.path })
    .setEntry('request.method', { value: req.method })
    .setEntry('user.agent', { value: req.headers['user-agent'] || 'unknown' });

  const newContext = propagation.setBaggage(context.active(), newBaggage);
  
  // Execute the rest of the middleware chain with the new context
  context.with(newContext, () => {
    next();
  });
});

app.get('/hello', (req, res) => {
  const tracer = trace.getTracer('example-app');
  
  // This span will be automatically annotated by our custom processor
  const span = tracer.startSpan('hello-handler');

  try {
    const currentBaggage = propagation.getActiveBaggage();
    console.log('🧳 Current baggage in handler:', 
      currentBaggage ? Object.fromEntries(currentBaggage.getAllEntries()) : null);
    
    // Simulate some work with nested spans
    const childSpan = tracer.startSpan('database-query', { parent: span });
    childSpan.setAttributes({
      'db.operation': 'SELECT',
      'db.table': 'users'
    });
    // This child span will also get baggage annotations
    childSpan.end();
    
    res.json({ 
      message: 'Hello with baggage annotations!',
      baggage: currentBaggage ? Object.fromEntries(currentBaggage.getAllEntries()) : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
});

app.get('/user/:id', (req, res) => {
  const tracer = trace.getTracer('example-app');
  const span = tracer.startSpan('get-user');

  try {
    // Add some span-specific attributes
    span.setAttributes({
      'user.requested_id': req.params.id,
      'http.route': '/user/:id'
    });

    const currentBaggage = propagation.getActiveBaggage();
    
    res.json({ 
      user: { id: req.params.id, name: 'John Doe' },
      context: currentBaggage ? Object.fromEntries(currentBaggage.getAllEntries()) : null
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
});

const server = app.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
  console.log('📊 Try these endpoints:');
  console.log('  GET http://localhost:3000/hello');
  console.log('  GET http://localhost:3000/user/123');
  console.log('');
  console.log('💡 Add headers to test baggage:');
  console.log('  -H "x-user-id: user123"');
  console.log('  -H "x-tenant-id: tenant456"');
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    shutdownTracing()
      .then(() => {
        console.log('✅ Shutdown complete');
        process.exit(0);
      })
      .catch(err => {
        console.error('❌ Error during shutdown:', err);
        process.exit(1);
      });
  });
}