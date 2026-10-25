import * as express from 'express';
import { Readable } from 'stream';
import { configureBodyParsers } from './body-parser.config';

describe('configureBodyParsers', () => {
  it('parses SES hook JSON regardless of the request content type', async () => {
    const app = express();
    configureBodyParsers(app, '512kb');
    const sesParser = (app as any).router.stack.find(
      (layer: any) => layer.name === 'jsonParser',
    ).handle;
    const payload = JSON.stringify({ Type: 'SubscriptionConfirmation' });
    const req = Readable.from([payload]) as any;
    req.headers = {
      'content-type': 'text/plain',
      'content-length': Buffer.byteLength(payload).toString(),
    };

    await new Promise<void>((resolve, reject) => {
      sesParser(req, {}, (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });

    expect(req.body).toEqual({ Type: 'SubscriptionConfirmation' });
  });
});
