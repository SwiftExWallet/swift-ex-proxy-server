import * as express from 'express';
import * as request from 'supertest';
import { configureBodyParsers } from './body-parser.config';

describe('configureBodyParsers', () => {
  it('parses SES hook JSON regardless of the request content type', async () => {
    const app = express();
    configureBodyParsers(app, '512kb');
    app.post('/api/v1/recovery/ses-hook', (req, res) => {
      res.json(req.body);
    });

    await request(app)
      .post('/api/v1/recovery/ses-hook')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ Type: 'SubscriptionConfirmation' }))
      .expect(200)
      .expect({ Type: 'SubscriptionConfirmation' });
  });
});
