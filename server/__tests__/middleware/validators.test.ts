import { body, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const { validate } = require('../../middleware/validators');

/**
 * Run express-validator chains against a request the way Express would, so the
 * tests exercise the real validate seam (validationResult reading off req),
 * not a mocked result.
 */
const runChains = async (req: Partial<Request>, chains: ValidationChain[]): Promise<void> => {
  for (const chain of chains) {
    await chain.run(req as Request);
  }
};

const makeRes = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('validate middleware', () => {
  const chains: ValidationChain[] = [
    body('email').isEmail().withMessage('Please enter a valid email'),
  ];

  it('responds 400 with { errors: [...] } and does not call next when validation fails', async () => {
    const req = { body: { email: 'not-an-email' } } as Partial<Request>;
    await runChains(req, chains);

    const res = makeRes();
    const next = jest.fn() as NextFunction;

    validate(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(Array.isArray(payload.errors)).toBe(true);
    expect(payload.errors.length).toBeGreaterThan(0);
    // Preserve the express-validator error shape the client consumes (err.msg).
    expect(payload.errors[0]).toHaveProperty('msg', 'Please enter a valid email');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sends no response when validation passes', async () => {
    const req = { body: { email: 'user@example.com' } } as Partial<Request>;
    await runChains(req, chains);

    const res = makeRes();
    const next = jest.fn() as NextFunction;

    validate(req as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
