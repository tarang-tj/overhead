// Local dev server: `npm run serve` then open the printed URL.
import { createStaticServer } from "./static-server.mjs";

const port = Number(process.env.PORT || 4173);
createStaticServer().listen(port, "127.0.0.1", () => {
  console.log(`OVERHEAD at http://127.0.0.1:${port}/`);
});
