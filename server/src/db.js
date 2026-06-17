'use strict';

const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connect() {
  const mode = (process.env.DB_MODE || 'memory').toLowerCase();

  if (mode === 'memory') {
    // Try in-process MongoDB first; fall back to a tiny JSON-file
    // store if mongodb-memory-server isn't installed or fails to start.
    try {
      let MongoMemoryServer;
      try {
        ({ MongoMemoryServer } = require('mongodb-memory-server'));
      } catch (_) {
        throw new Error('mongodb-memory-server missing');
      }
      const mem = await MongoMemoryServer.create();
      const uri = mem.getUri();
      client = new MongoClient(uri);
      await client.connect();
      db = client.db(process.env.MONGO_DB || 'stats_bot');
      console.log('[db] connected to in-memory MongoDB at', uri);
      return db;
    } catch (e) {
      console.warn('[db] in-memory MongoDB unavailable (' + e.message + '), falling back to file store');
      const file = require('./db_file');
      db = await file.connect();
      return db;
    }
  }

  if (mode === 'file') {
    const file = require('./db_file');
    db = await file.connect();
    return db;
  }

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGO_DB || 'stats_bot');
  console.log('[db] connected to MongoDB at', uri);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database is not initialized. Call connect() first.');
  return db;
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connect, getDb, close };
