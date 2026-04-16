import { db } from "./index.js";
import { users } from "./schema.js";

const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function seedDefaultUser() {
  await db
    .insert(users)
    .values({
      id: DEFAULT_USER_ID,
      name: "Default User",
      email: "default@local",
    })
    .onConflictDoNothing()
    .execute();
}
