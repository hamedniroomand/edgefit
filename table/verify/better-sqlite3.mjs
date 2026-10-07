// Reaches the native addon: the database loads it when it opens.
import Database from 'better-sqlite3';

export async function run() {
  new Database(':memory:').close();
}
