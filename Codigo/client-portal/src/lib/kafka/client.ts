import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'diamond-client-app',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

export const producer = kafka.producer();

export async function connectProducer() {
  await producer.connect();
}

export async function disconnectProducer() {
  await producer.disconnect();
}

export async function produceEvent(topic: string, eventType: string, payload: any) {
  await connectProducer();
  await producer.send({
    topic,
    messages: [
      {
        key: eventType,
        value: JSON.stringify({
          eventType,
          payload,
          timestamp: new Date().toISOString()
        }),
      },
    ],
  });
}
