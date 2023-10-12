import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

dotenv.config();

const connectionString = process.env.ATLAS_URI || '';
const client = new MongoClient(connectionString);

export class Database {
  static instance;

  static async getInstance(req) {
    if (!Database.instance) {
      if (req !== 'unit-test') {
        let conn;
        try {
          conn = await client.connect();
        } catch (e) {
          console.error(e);
        }

        Database.instance = conn.db('grindery-bot');
      } else {
        // This will create an new instance of "MongoMemoryServer" and automatically start it
        const mongod = await MongoMemoryServer.create();
        const clientMemory = new MongoClient(mongod.getUri());
        const connMemory = await clientMemory.connect();

        Database.instance = connMemory.db('grindery-test-server');
      }
    }
    return Database.instance;
  }
}
