`Run this using OTEL_EXPORTER_OTLP_HEADERS="signoz-access-token=<SIGNOZ_INGESTION_KEY>" node --require ./tracing.js app.js`

I would also recommend you to change the url according to your own service endpoint
```
  const exporter = new OTLPTraceExporter({
    url: 'https://ingest.us.staging.signoz.cloud:443/v1/traces',
  });
```