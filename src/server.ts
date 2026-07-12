import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`KMG-SERVICE-API listening on port ${env.PORT}`);
});
