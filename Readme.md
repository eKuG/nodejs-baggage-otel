`Run this using OTEL_EXPORTER_OTLP_HEADERS="signoz-access-token=<SIGNOZ_INGESTION_KEY>" node --require ./tracing.js app.js`

I would also recommend you to change the url according to your own service endpoint
```
  const exporter = new OTLPTraceExporter({
    url: 'https://ingest.us.staging.signoz.cloud:443/v1/traces',
  });
```

### Active Context Propagation

This application uses OpenTelemetry’s AsyncHooks-based context manager along with HTTP and Fastify instrumentation:

AsyncHooks Context ManagerAutomatically propagates the active context (trace and baggage) across async boundaries without manual context.with calls.

HTTP & Fastify InstrumentationAuto-extract incoming traceparent and baggage headers, starting a server span in the background.

Custom BaggageAnnotationSpanProcessorOn each span’s onStart, reads all baggage entries via propagation.getBaggage(context.active()) and sets them as span attributes prefixed with baggage.

Together, this means every time you start a span (e.g., in your route handlers), it inherits the correct parent span and has all baggage annotations applied automatically.