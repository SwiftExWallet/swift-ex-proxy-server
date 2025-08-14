import { Request, Response, NextFunction } from 'express';

export function bigintJsonSerializerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalJson = res.json;

  res.json = function (body: any) {
    const safeBody = JSON.parse(
      JSON.stringify(body, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
    return originalJson.call(this, safeBody);
  };

  next();
}
