import type { VynnMiddleware } from "vynn/server";

const requestLogger: VynnMiddleware = async (context, next) => {
  console.log(context);
  return next();
};

export default [requestLogger];
