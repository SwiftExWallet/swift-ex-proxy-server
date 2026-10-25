import { Application, json, urlencoded } from 'express';

export function configureBodyParsers(
  app: Application,
  apiBodyLimit: string,
): void {
  app.use(
    '/api/v1/recovery/ses-hook',
    json({ type: '*/*', limit: apiBodyLimit }),
  );
  app.use(
    json({ limit: apiBodyLimit }),
    urlencoded({ extended: true, limit: apiBodyLimit }),
  );
}
