import 'reflect-metadata';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
  BodySizeLimit,
} from './body-size-limit.decorator';

describe('BodySizeLimit decorator', () => {
  it('stores route body size metadata on the decorated method', () => {
    class TestController {
      @BodySizeLimit(BODY_SIZE_LIMITS.standard, 'test-route')
      handler() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(
        BODY_SIZE_LIMIT_KEY,
        TestController.prototype.handler,
      ),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'test-route',
    });
  });
});
