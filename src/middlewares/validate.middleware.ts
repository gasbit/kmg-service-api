import type { NextFunction, Request, Response } from "express";
import type { AnyZodObject } from "zod";

export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    req.body = parsed.body ?? req.body;
    req.params = parsed.params ?? req.params;
    next();
  };
}
