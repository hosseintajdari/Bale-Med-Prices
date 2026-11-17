/**
 * Hard deadline for a promise. Prime QA round 2 (R2-5) found queries
 * that never answered (>25s) and contaminated the queue behind them;
 * the per-adapter budgets do not cover every path, so the API boundary
 * itself gets an absolute cap. On expiry the caller degrades to an
 * honest empty answer instead of holding the request open.
 */
export class DeadlineExceededError extends Error {
  constructor(ms) {
    super(`Search exceeded the ${ms}ms deadline`);
    this.name = "DeadlineExceededError";
    this.code = "DEADLINE_EXCEEDED";
  }
}

export function withDeadline(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineExceededError(ms)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
