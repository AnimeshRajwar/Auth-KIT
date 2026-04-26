const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'auth-service';

if (!mongoUri) {
  throw new Error('MONGO_URI is missing in .env');
}

let client;
let db;

async function getDb() {
  if (db) return db;
  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

async function getCollection(name) {
  const database = await getDb();
  return database.collection(name);
}

module.exports = { getDb, getCollection };