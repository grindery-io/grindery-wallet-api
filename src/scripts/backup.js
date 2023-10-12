import { Database } from '../db/conn.js';

// Usage: cloneCollection(sourceCollectionName, targetCollectionName)
// - sourceCollectionName: The name of the source collection to clone.
// - targetCollectionName: The name of the target collection where data will be copied.
// Example: cloneCollection("users", "users-backup");
async function cloneCollection(sourceCollectionName, targetCollectionName) {
  try {
    const db = await Database.getInstance();
    const sourceCollection = db.collection(sourceCollectionName);
    const targetCollection = db.collection(targetCollectionName);

    // Check if the target collection exists before attempting to drop it
    const collections = await db.listCollections().toArray();
    const targetCollectionExists = collections.some(
      (collection) => collection.name === targetCollectionName
    );

    if (targetCollectionExists) {
      // Drop the target collection if it already exists to start fresh
      await targetCollection.drop();
    }

    // Create a new collection by copying the documents from the source collection
    await sourceCollection.aggregate([{ $out: targetCollectionName }]).next();

    console.log(
      `Collection '${sourceCollectionName}' cloned to '${targetCollectionName}'`
    );
  } catch (error) {
    console.error('Error cloning collection:', error);
  } finally {
    process.exit(0);
  }
}
