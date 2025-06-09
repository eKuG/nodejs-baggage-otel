// tracing.js

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { propagation, context } = require('@opentelemetry/api');
const {
  CompositePropagator,
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
} = require('@opentelemetry/core');

// Custom Span Processor that reads baggage and annotates spans
class BaggageAnnotationSpanProcessor {
  onStart(span, parentContext) {
    try {
      const bag = propagation.getBaggage(parentContext || context.active());
      if (bag) {
        for (const [key, entry] of bag.getAllEntries()) {
          span.setAttribute(`baggage.${key}`, entry.value);
        }
        console.log(
          `📝 Annotated span "${span.name}" with baggage:`,
          Object.fromEntries(bag.getAllEntries())
        );
      }
    } catch (err) {
      console.error('Error in BaggageAnnotationSpanProcessor onStart:', err);
    }
  }

  onEnd(span) {
    // no-op
  }

  shutdown() {
    return Promise.resolve();
  }

  forceFlush() {
    return Promise.resolve();
  }
}

let sdk;

async function initTracing() {
  // Configure global propagator to extract both tracecontext & baggage
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    })
  );

  const exporter = new OTLPTraceExporter({
    url: 'https://ingest.us.staging.signoz.cloud:443/v1/traces',
  });

  sdk = new NodeSDK({
    // Note: plural "spanProcessors"
    spanProcessors: [
      new BaggageAnnotationSpanProcessor(),
      new BatchSpanProcessor(exporter),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // HTTP instrumentation will extract incoming headers & baggage automatically
        '@opentelemetry/instrumentation-http': {
          propagateBaggage: true,
        },
        // Fastify instrumentation for your routes
        '@opentelemetry/instrumentation-fastify': {},
      }),
    ],
  });

  await sdk.start();
  console.log('✅ Tracing initialized');
}

function shutdownTracing() {
  return sdk ? sdk.shutdown() : Promise.resolve();
}

module.exports = {
  initTracing,
  shutdownTracing,
};