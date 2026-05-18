import { MongoClient, type Db } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __lauchgruenMongoClient: Promise<MongoClient> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing environment variable: MONGODB_URI");

  if (!globalThis.__lauchgruenMongoClient) {
    globalThis.__lauchgruenMongoClient = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }).connect();
  }
  return globalThis.__lauchgruenMongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  const dbName = process.env.MONGODB_DB ?? "lauchgruen";
  return client.db(dbName);
}
