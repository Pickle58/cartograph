import { auth, defineIdentity } from "managed-deepagents";

// A LangSmith key decides who may call this service. It does not name an
// analysis and it cannot read the database. The analysis credential arrives
// on the run and is only forwarded.
export const identity = defineIdentity({
  auth: auth.langsmithApiKey(),
});
