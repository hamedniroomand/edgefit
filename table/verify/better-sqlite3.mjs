// Opens a database, which loads the native addon. On workerd the run throws a TypeError first: see the note of the row.
import Database from 'better-sqlite3';

export async function run() {
  new Database(':memory:').close();
}
