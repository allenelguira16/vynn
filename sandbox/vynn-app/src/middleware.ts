import type { VynnMiddleware } from "vynn/server";

const requestLogger: VynnMiddleware = async (_context, next) => {
  return next();
};

export default [requestLogger];
