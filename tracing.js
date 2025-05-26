const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor, SpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { propagation, context } = require('@opentelemetry/api');
const { CompositePropagator, W3CTraceContextPropagator, W3CBaggagePropagator } = require('@opentelemetry/core');

// Custom Span Processor that reads baggage and annotates spans
class BaggageAnnotationSpanProcessor {
  onStart(span, parentContext) {
    try {
      // Get baggage from the current context
      const baggage = propagation.getBaggage(parentContext || context.active());
      
      if (baggage) {
        // Iterate through all baggage entries and add them as span attributes
        for (const [key, entry] of baggage.getAllEntries()) {
          // Prefix baggage attributes to distinguish them
          span.setAttributes({
            [`baggage.${key}`]: entry.value
          });
        }
        
        console.log(`📝 Annotated span "${span.name}" with baggage:`, 
          Object.fromEntries(baggage.getAllEntries()));
      }
    } catch (error) {
      console.error('Error processing baggage in span processor:', error);
    }
  }

  onEnd(span) {
    // Nothing to do on end
  }

  shutdown() {
    return Promise.resolve();
  }

  forceFlush() {
    return Promise.resolve();
  }
}

let sdk;

function initTracing() {
  // Configure propagator
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator()
      ],
    })
  );

  const exporter = new OTLPTraceExporter({
    url: 'https://ingest.us.staging.signoz.cloud:443/v1/traces',
  });

  sdk = new NodeSDK({
    spanProcessors: [
      new BaggageAnnotationSpanProcessor(), // Our custom processor first
      new BatchSpanProcessor(exporter)      // Then the export processor
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          propagateBaggage: true
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true
        }
      })
    ]
  });

  // sdk.start() is synchronous, doesn't return a Promise
  sdk.start();
  console.log('✅ Tracing initialized');
}

function shutdownTracing() {
  if (sdk) {
    return sdk.shutdown();
  }
  return Promise.resolve();
}

module.exports = {
  initTracing,
  shutdownTracing
};