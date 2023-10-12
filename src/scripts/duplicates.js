import { Database } from '../db/conn.js';

// Example usage of the functions:
// removeDuplicateUsers();
async function removeDuplicateUsers(targetCollection, refId) {
  try {
    const db = await Database.getInstance();
    const collection = db.collection(targetCollection);

    // Aggregation pipeline to identify duplicates and keep the first instance
    const aggregationPipeline = [
      {
        $group: {
          _id: `$${refId}`,
          firstInstance: { $first: '$_id' },
        },
      },
    ];

    // Find the first instance of each duplicate
    const firstInstances = await collection
      .aggregate(aggregationPipeline)
      .toArray();

    // Create an array of _id values to keep (first instances)
    const idsToKeep = firstInstances.map((instance) => instance.firstInstance);

    // Delete all documents that are not in the idsToKeep array
    const deleteResult = await collection.deleteMany({
      _id: { $nin: idsToKeep },
    });

    console.log(`Deleted ${deleteResult.deletedCount} duplicate users.`);
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  } finally {
    process.exit(0);
  }
}
